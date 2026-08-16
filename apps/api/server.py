import asyncio
import base64
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import uuid
from io import BytesIO
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[2]
try:
    from dotenv import load_dotenv

    load_dotenv(REPO_ROOT / ".env")
except Exception:
    pass

ROOT = REPO_ROOT / "apps" / "web"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_AGENT_MODEL = os.getenv("OPENAI_AGENT_MODEL", "gpt-5.6")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2")
RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID", "")
RUNPOD_USE_FLASH = os.getenv("RUNPOD_USE_FLASH", "0").lower() in {"1", "true", "yes", "on"}


TYPE_LABELS = {
    "face": "different realistic non-identifiable face",
    "store_sign": "fictional storefront sign",
    "road_sign": "fictional road or station sign",
    "license_plate": "invalid natural-looking license plate",
    "landmark": "generic background structure",
}


class AgentServer(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/api/agent/analyze":
                self.send_json(analyze_image(payload))
            elif self.path == "/api/agent/replace":
                self.send_json(replace_image(payload))
            elif self.path == "/api/agent/verify":
                self.send_json(verify_image(payload))
            else:
                self.send_error(404, "Unknown API route")
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=500)

    def send_json(self, data, status=200):
        encoded = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def analyze_image(payload):
    image_data_url = payload.get("imageDataUrl")
    width = int(payload.get("width", 1200))
    height = int(payload.get("height", 760))
    source_kind = payload.get("sourceKind", "upload")

    runpod_result = call_runpod(
        {
            "operation": "analyze",
            "image_data_url": image_data_url,
            "width": width,
            "height": height,
            "models": {
                "face": "InsightFace SCRFD or RetinaFace",
                "open_vocab": "Grounding DINO",
                "ocr": "PaddleOCR PP-OCRv5 Korean",
                "mask": "SAM 2",
            },
            "prompts": [
                "face",
                "store sign",
                "restaurant sign",
                "road sign",
                "station sign",
                "license plate",
                "landmark",
            ],
        }
    )

    openai_result = None
    if OPENAI_API_KEY and image_data_url:
        try:
            openai_result = openai_json(
                build_analysis_prompt(width, height),
                image_data_url=image_data_url,
                schema_name="image_context_analysis",
            )
        except Exception as exc:
            print(f"OpenAI analyze failed: {exc}", file=sys.stderr)

    if openai_result and openai_result.get("candidates"):
        candidates = normalize_candidates(openai_result.get("candidates", []), width, height)
        plans = plan_edits(image_data_url, candidates, width, height, provider_hint="openai")
        provider = "openai-vision"
        if runpod_result:
            provider = "openai-vision+runpod-flash-rest"
        return {
            "provider": provider,
            "summary": openai_result.get(
                "summary",
                "OpenAI vision Agent가 실제 이미지에서 식별 단서 후보를 찾았습니다.",
            ),
            "scene": openai_result.get("scene", ""),
            "candidates": candidates,
            "editPlans": plans,
        }

    if runpod_result:
        candidates = normalize_candidates(runpod_result.get("candidates", []), width, height)
        plans = plan_edits(image_data_url, candidates, width, height, provider_hint="runpod")
        return {
            "provider": "runpod-flash-rest",
            "summary": "배포된 RunPod Flash endpoint가 탐지/OCR/마스크 후보를 만들었습니다.",
            "scene": runpod_result.get("scene", ""),
            "candidates": candidates,
            "editPlans": plans,
        }

    flash_result = call_runpod_flash(
        {
            "operation": "analyze",
            "image_data_url": image_data_url,
            "width": width,
            "height": height,
        }
    )
    if flash_result:
        candidates = normalize_candidates(flash_result.get("candidates", []), width, height)
        plans = plan_edits(image_data_url, candidates, width, height, provider_hint="flash")
        return {
            "provider": "runpod-flash-direct+openai" if OPENAI_API_KEY else "runpod-flash-direct",
            "summary": "RunPod Flash Python 함수가 탐지/OCR/마스크 후보를 만들었습니다.",
            "scene": flash_result.get("scene", ""),
            "candidates": candidates,
            "editPlans": plans,
        }

    if source_kind == "sample":
        return fallback_analysis(width, height)

    return {
        "provider": "offline",
        "summary": "RunPod/OpenAI 분석 연결이 실패했습니다. 업로드 이미지에는 샘플 좌표를 적용하지 않았습니다.",
        "scene": "",
        "candidates": [],
        "editPlans": [],
        "connectionStatus": {
            "runpod": "failed_or_unavailable",
            "openai": "failed_or_unavailable",
        },
    }


def replace_image(payload):
    image_data_url = payload.get("imageDataUrl")
    width = int(payload.get("width", 1200))
    height = int(payload.get("height", 760))
    candidates = normalize_candidates(payload.get("candidates", []), width, height)
    preserved_candidates = normalize_candidates(payload.get("preservedCandidates", []), width, height)
    masks = {item.get("id"): item.get("maskDataUrl") for item in payload.get("masks", [])}
    plans = plan_edits(
        image_data_url,
        candidates,
        width,
        height,
        provider_hint="replace",
        preserved_candidates=preserved_candidates,
    )

    if payload.get("mode") == "plan":
        return {
            "provider": "openai-plan" if OPENAI_API_KEY else "local-plan",
            "summary": "Agent가 후보별 편집 프롬프트를 생성했습니다.",
            "editPlans": plans,
        }

    if OPENAI_API_KEY and image_data_url:
        current_image = image_data_url
        applied = []
        candidates_by_id = {candidate.get("id"): candidate for candidate in candidates}
        for plan in plans:
            target_id = plan.get("targetId")
            mask_data_url = masks.get(target_id)
            candidate = candidates_by_id.get(target_id)
            if not mask_data_url:
                continue
            prompt = plan.get("editPrompt") or build_default_edit_prompt(plan)
            try:
                current_image = openai_image_edit_region(
                    current_image,
                    mask_data_url,
                    prompt,
                    candidate,
                )
                applied.append({**plan, "status": "applied"})
            except Exception as exc:
                applied.append({**plan, "status": "failed", "error": str(exc)})
                break
        if applied and all(item.get("status") == "applied" for item in applied):
            return {
                "provider": "openai-image-edit",
                "summary": "OpenAI 이미지 편집 모델이 마스크 영역을 자연 치환했습니다.",
                "resultImageDataUrl": current_image,
                "editPlans": applied,
            }

    return {
        "provider": "local-fallback",
        "summary": "API 키가 없거나 이미지 편집 호출이 실패해 프롬프트 계획만 반환합니다.",
        "editPlans": plans,
    }


def verify_image(payload):
    result_image = payload.get("resultImageDataUrl")
    candidates = payload.get("candidates", [])
    plans = payload.get("editPlans", [])

    if OPENAI_API_KEY and result_image:
        prompt = """
You are a privacy-preserving image replacement verifier.
Inspect the result image only for remaining visual clues that could identify a person,
exact location, storefront, road/station sign, license plate, or landmark.
Do not identify real people or real places. Return strict JSON:
{
  "verdict": "pass" | "review" | "fail",
  "summary": "short Korean summary",
  "remainingRisks": ["..."],
  "qualityNotes": ["..."],
  "recommendedNextActions": ["..."]
}
"""
        data = openai_json(prompt, image_data_url=result_image, schema_name="verification")
        return {
            "provider": "openai-verify",
            "verdict": data.get("verdict", "review"),
            "summary": data.get("summary", "검수가 끝났습니다."),
            "remainingRisks": data.get("remainingRisks", []),
            "qualityNotes": data.get("qualityNotes", []),
            "recommendedNextActions": data.get("recommendedNextActions", []),
        }

    selected_count = len([item for item in candidates if item.get("selected", True)])
    return {
        "provider": "local-verify",
        "verdict": "로컬 검수: 선택 후보 처리 완료",
        "summary": f"{selected_count}개 후보가 치환 대상으로 처리되었습니다.",
        "remainingRisks": [] if plans else ["AI 검수를 사용하려면 OPENAI_API_KEY가 필요합니다."],
        "qualityNotes": ["현재 로컬 검수는 실제 이미지 이해 모델을 사용하지 않습니다."],
    }


def plan_edits(image_data_url, candidates, width, height, provider_hint="openai", preserved_candidates=None):
    if not candidates:
        return []
    preserved_candidates = preserved_candidates or []
    if OPENAI_API_KEY and image_data_url:
        prompt = build_planning_prompt(candidates, width, height, preserved_candidates)
        try:
            data = openai_json(prompt, image_data_url=image_data_url, schema_name="edit_plans")
            plans = data.get("editPlans", [])
            return normalize_plans(plans, candidates)
        except Exception:
            pass
    return [fallback_plan(candidate) for candidate in candidates]


def build_analysis_prompt(width, height):
    return f"""
You are an agent for natural privacy-preserving image replacement.
Analyze this image and find visual clues that could identify a person or location.
Focus on faces, store signs, restaurant/cafe signs, road signs, station/bus stop signs,
building names, license plates, distinctive landmarks, banners, and location-specific text.

Do not identify real people or name the actual place. Do not dox. Only assess whether visual
elements could reveal identity or location.

Return strict JSON. Coordinates must be pixel coordinates for this displayed canvas:
width={width}, height={height}.
Allowed types: face, store_sign, road_sign, license_plate, landmark.
Be precise. Use tight boxes around the visual clue, not the whole person or whole scene.
For faces, box the visible face plus a small hairline/jaw margin. For signs, box the sign or
the exact location-specific text region. For license plates, box the plate, not the car.
Prefer real visible clues over generic guesses. If you are not confident, omit the candidate.
{{
  "summary": "short Korean summary",
  "scene": "visual mood, lighting, camera distance, weather",
  "candidates": [
    {{
      "id": "stable id",
      "type": "face|store_sign|road_sign|license_plate|landmark",
      "x": 0, "y": 0, "w": 100, "h": 100,
      "risk": "high|medium|low",
      "reason": "Korean reason",
      "styleNotes": "lighting/material/perspective notes",
      "replacementGoal": "what should be generated instead"
    }}
  ]
}}
"""


def build_planning_prompt(candidates, width, height, preserved_candidates=None):
    preserved_candidates = preserved_candidates or []
    return f"""
You are the edit director agent for a context-preserving image replacement app.
The user selected these candidates:
{json.dumps(candidates, ensure_ascii=False)}

The user explicitly marked these detected regions as PRESERVE / DO NOT CHANGE:
{json.dumps(preserved_candidates, ensure_ascii=False)}

For each target, create a high-quality localized crop inpainting prompt. The final image must feel
like the original untouched photograph. Preserve the whole photo's mood, lighting, camera angle,
grain/noise, focus, scale, perspective, compression, color cast, lens softness, and surrounding
context. It must not blur, mosaic, censor, black-box, cartoonize, beautify, upscale, sharpen, clean
up, relight, recolor, or visibly alter unrelated areas. Faces must become different realistic
non-identifiable people, not the same person with minor edits. Signs should usually keep the
existing sign board, material, perspective, shadows, and lighting while changing only the
location-identifying lettering to fictional neutral text.
Explicitly mention every preserved region as a do-not-change constraint when relevant. Never
create a prompt that edits or restyles preserved candidates.

Return strict JSON:
{{
  "summary": "short Korean summary",
  "editPlans": [
    {{
      "targetId": "candidate id",
      "type": "candidate type",
      "replacementText": "short fake text if useful, otherwise empty",
      "editPrompt": "English image edit prompt for masked inpainting",
      "negativePrompt": "things to avoid",
      "qualityChecks": ["..."]
    }}
  ]
}}
Canvas size: {width}x{height}.
"""


def fallback_analysis(width, height):
    return {
        "provider": "local",
        "summary": "로컬 데모 후보를 생성했습니다. 실제 자동 탐지는 RunPod/OpenAI 키 연결 후 활성화됩니다.",
        "scene": "warm daylight Korean street illustration",
        "candidates": [
            make_candidate("face", 206, 497, 48, 48, "선명한 사람 얼굴", "high"),
            make_candidate("face", 687, 511, 38, 38, "배경 인물 얼굴", "medium"),
            make_candidate("store_sign", 100, 335, 230, 72, "식당 상호 간판", "high"),
            make_candidate("store_sign", 800, 350, 250, 66, "카페 상호 간판", "high"),
            make_candidate("road_sign", 470, 108, 270, 86, "지명/도로 표지판", "high"),
            make_candidate("license_plate", 555, 600, 118, 42, "차량 번호판", "high"),
        ],
        "editPlans": [],
    }


def make_candidate(kind, x, y, w, h, reason, risk):
    return {
        "id": f"{kind}_{uuid.uuid4().hex[:8]}",
        "type": kind,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "risk": risk,
        "reason": reason,
        "replacementGoal": TYPE_LABELS[kind],
        "selected": True,
    }


def fallback_plan(candidate):
    kind = candidate.get("type", "landmark")
    replacement_text = {
        "store_sign": "다온밥상",
        "road_sign": "가람역 3km",
        "license_plate": "00가 0000",
        "face": "",
        "landmark": "",
    }.get(kind, "")
    prompts = {
        "face": "Edit only the masked face pixels inside this crop. Replace the source face with a genuinely different realistic non-identifiable adult face. Preserve the exact head pose, gaze direction, expression intensity, camera distance, focal softness, compression, grain, lighting, shadows, color cast, hairline boundary, neck connection, clothing, and background. Do not beautify, sharpen, relight, blur, censor, stylize, or change anything outside the face.",
        "store_sign": f"Edit only the masked lettering area inside this crop. Keep the original sign board, material, perspective, folds, print texture, shadows, reflections, lighting, color cast, blur, grain, and camera focus. Replace only the location-identifying text with fictional Korean text reading '{replacement_text}', matching the original typography scale and paint/print integration so it looks photographed, not overlaid. Do not redesign the sign.",
        "road_sign": f"Edit only the masked lettering area inside this crop. Keep the original road or station sign plate, color, reflective material, perspective, weathering, shadows, blur, grain, and camera focus. Replace only the location-specific text with fictional neutral text like '{replacement_text}', matching the original typography and physical print. Do not redesign the sign.",
        "license_plate": f"Edit only the masked license plate characters inside this crop. Keep the plate shape, border, material, dirt, reflections, perspective, lighting, blur, and compression. Replace the characters with an invalid natural-looking number such as '{replacement_text}', integrated as printed plate text. Do not blur or censor.",
        "landmark": "Edit only the masked location-identifying pixels inside this crop. Replace them with a generic realistic background element that matches the same architecture scale, lighting, camera angle, focus, color temperature, grain, compression, and photographic mood. Do not blur, censor, beautify, sharpen, or change the scene outside the mask.",
    }
    return {
        "targetId": candidate.get("id"),
        "type": kind,
        "replacementText": replacement_text,
        "editPrompt": prompts.get(kind, prompts["landmark"]),
        "negativePrompt": "blur, mosaic, black box, censor bar, cartoon, obvious AI artifact, unreadable smearing, changed global mood, changed camera angle, changed surrounding pixels, redesign, overlaid text, crisp digital text, beauty filter",
        "qualityChecks": [
            "masked area only changed",
            "original identity/location clue removed",
            "lighting and perspective match the original photo",
        ],
    }


def normalize_candidates(candidates, width, height):
    normalized = []
    for index, item in enumerate(candidates):
        kind = item.get("type", "landmark")
        if kind not in TYPE_LABELS:
            kind = "landmark"
        x = float(item.get("x", item.get("bbox", [0, 0, 80, 80])[0]))
        y = float(item.get("y", item.get("bbox", [0, 0, 80, 80])[1]))
        w = float(item.get("w", item.get("bbox", [0, 0, 80, 80])[2]))
        h = float(item.get("h", item.get("bbox", [0, 0, 80, 80])[3]))
        if 0 <= x <= 1000 and 0 <= y <= 1000 and 0 < w <= 1000 and 0 < h <= 1000 and (x + w > width or y + h > height):
            x = x / 1000 * width
            y = y / 1000 * height
            w = w / 1000 * width
            h = h / 1000 * height
        x = max(0, min(width - 1, round(x)))
        y = max(0, min(height - 1, round(y)))
        w = max(8, min(width - x, round(w)))
        h = max(8, min(height - y, round(h)))
        normalized.append(
            {
                "id": item.get("id") or f"{kind}_{index + 1}",
                "type": kind,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "risk": item.get("risk", "medium"),
                "reason": item.get("reason", "식별 단서 후보"),
                "styleNotes": item.get("styleNotes", ""),
                "replacementGoal": item.get("replacementGoal", TYPE_LABELS[kind]),
                "selected": item.get("selected", True),
            }
        )
    return normalized


def normalize_plans(plans, candidates):
    by_id = {item.get("id"): item for item in candidates}
    output = []
    for plan in plans:
        target_id = plan.get("targetId")
        if target_id not in by_id:
            continue
        fallback = fallback_plan(by_id[target_id])
        output.append({**fallback, **plan})
    existing = {plan.get("targetId") for plan in output}
    for candidate in candidates:
        if candidate.get("id") not in existing:
            output.append(fallback_plan(candidate))
    return output


def openai_json(prompt, image_data_url=None, schema_name="agent_json"):
    content = [{"type": "input_text", "text": prompt}]
    if image_data_url:
        content.append({"type": "input_image", "image_url": image_data_url, "detail": "high"})
    body = {
        "model": OPENAI_AGENT_MODEL,
        "input": [{"role": "user", "content": content}],
    }
    data = post_json("https://api.openai.com/v1/responses", body, OPENAI_API_KEY)
    text = collect_output_text(data)
    return parse_json_text(text)


def openai_image_edit_region(image_data_url, mask_data_url, prompt, candidate):
    if not candidate:
        return openai_image_edit(image_data_url, mask_data_url, build_localized_edit_prompt(prompt, None))

    source = data_url_to_image(image_data_url).convert("RGBA")
    mask = data_url_to_image(mask_data_url).convert("RGBA")
    if mask.size != source.size:
        mask = mask.resize(source.size, Image.Resampling.NEAREST)

    crop_box = crop_box_for_candidate(candidate, source.width, source.height)
    source_crop = source.crop(crop_box)
    mask_crop = mask.crop(crop_box)
    editable_alpha = ImageChops.invert(mask_crop.getchannel("A"))
    if not editable_alpha.getbbox():
        return image_data_url

    localized_prompt = build_localized_edit_prompt(prompt, candidate, crop_box)
    edited_crop_url = openai_image_edit(
        image_to_data_url(source_crop),
        image_to_data_url(mask_crop),
        localized_prompt,
    )
    edited_crop = data_url_to_image(edited_crop_url).convert("RGBA")
    if edited_crop.size != source_crop.size:
        edited_crop = edited_crop.resize(source_crop.size, Image.Resampling.LANCZOS)

    blend_alpha = feather_edit_alpha(editable_alpha, candidate)
    merged_crop = Image.composite(edited_crop, source_crop, blend_alpha)
    source.paste(merged_crop, crop_box)
    return image_to_data_url(source)


def crop_box_for_candidate(candidate, width, height):
    x = int(candidate.get("x", 0))
    y = int(candidate.get("y", 0))
    w = int(candidate.get("w", 80))
    h = int(candidate.get("h", 80))
    kind = candidate.get("type", "landmark")
    scale = {
        "face": 0.9,
        "store_sign": 0.45,
        "road_sign": 0.45,
        "license_plate": 0.55,
        "landmark": 0.65,
    }.get(kind, 0.55)
    pad = max(24, int(max(w, h) * scale))
    left = max(0, x - pad)
    top = max(0, y - pad)
    right = min(width, x + w + pad)
    bottom = min(height, y + h + pad)
    return (left, top, right, bottom)


def feather_edit_alpha(editable_alpha, candidate):
    kind = (candidate or {}).get("type", "landmark")
    shortest = min(editable_alpha.size)
    expand = {
        "face": max(3, min(15, int(shortest * 0.05))),
        "store_sign": max(1, min(8, int(shortest * 0.025))),
        "road_sign": max(1, min(8, int(shortest * 0.025))),
        "license_plate": max(1, min(6, int(shortest * 0.02))),
        "landmark": max(3, min(14, int(shortest * 0.04))),
    }.get(kind, 5)
    blur = {
        "face": max(1.2, expand * 0.55),
        "store_sign": max(0.8, expand * 0.4),
        "road_sign": max(0.8, expand * 0.4),
        "license_plate": max(0.6, expand * 0.35),
        "landmark": max(1.0, expand * 0.5),
    }.get(kind, 1.5)
    size = expand * 2 + 1
    alpha = editable_alpha.filter(ImageFilter.MaxFilter(size))
    alpha = alpha.filter(ImageFilter.GaussianBlur(blur))
    return alpha.point(lambda value: 255 if value > 245 else value)


def build_localized_edit_prompt(prompt, candidate=None, crop_box=None):
    kind = (candidate or {}).get("type", "masked target")
    crop_note = f"Crop box in the original canvas: {crop_box}." if crop_box else ""
    target_note = (
        "This crop will be pasted back into the original photo with a soft mask. "
        "Only the transparent/white masked pixels are allowed to change. "
        "All unmasked pixels must remain visually identical to the input crop: same composition, "
        "camera position, scale, lighting, grain, compression, blur, shadows, color cast, and texture. "
        "Do not improve, clean up, beautify, sharpen, upscale, relight, recolor, crop, rotate, or redraw the crop. "
    )
    if kind in {"store_sign", "road_sign", "license_plate"}:
        target_note += (
            "For text or signage, preserve the existing physical object and change only the masked characters. "
            "The new lettering must inherit the original paint/print texture, perspective, softness, spacing, "
            "occlusion, and illumination. It must not look like a flat digital overlay. "
        )
    if kind == "face":
        target_note += (
            "For a face, generate a genuinely different realistic non-identifiable person while preserving "
            "pose, gaze, expression level, local shadows, skin highlight intensity, hairline/neck boundaries, "
            "image noise, and low-resolution detail. "
        )
    return f"{target_note}{crop_note}\n\nRequested local edit:\n{prompt}"


def openai_image_edit(image_data_url, mask_data_url, prompt):
    image_bytes, image_type = decode_data_url(image_data_url)
    mask_bytes, mask_type = decode_data_url(mask_data_url)
    fields = {
        "model": OPENAI_IMAGE_MODEL,
        "prompt": prompt,
        "size": "auto",
    }
    files = [
        ("image[]", "image.png", image_type or "image/png", image_bytes),
        ("mask", "mask.png", mask_type or "image/png", mask_bytes),
    ]
    data = post_multipart("https://api.openai.com/v1/images/edits", fields, files, OPENAI_API_KEY)
    b64_json = data.get("data", [{}])[0].get("b64_json")
    if not b64_json:
        raise RuntimeError("OpenAI image edit response did not include b64_json")
    return "data:image/png;base64," + b64_json


def data_url_to_image(data_url):
    image_bytes, _ = decode_data_url(data_url)
    return Image.open(BytesIO(image_bytes))


def image_to_data_url(image):
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def call_runpod(input_payload):
    if not RUNPOD_API_KEY or not RUNPOD_ENDPOINT_ID:
        print("RunPod skipped: missing key or endpoint", file=sys.stderr)
        return None
    url = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/runsync"
    try:
        data = post_json(url, {"input": input_payload}, RUNPOD_API_KEY)
        output = data.get("output") or data.get("result")
        print(
            f"RunPod response status={data.get('status')} output_type={type(output).__name__}",
            file=sys.stderr,
        )
        return output if isinstance(output, dict) else None
    except Exception as exc:
        print(f"RunPod call failed: {exc}", file=sys.stderr)
        return None


def call_runpod_flash(input_payload):
    if not RUNPOD_USE_FLASH:
        return None
    try:
        flash_dir = REPO_ROOT / "services" / "flash"
        if str(flash_dir) not in sys.path:
            sys.path.insert(0, str(flash_dir))
        from agent_gpu import analyze_image_on_gpu

        return asyncio.run(analyze_image_on_gpu(**input_payload))
    except RuntimeError as exc:
        if "asyncio.run()" in str(exc):
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(analyze_image_on_gpu(**input_payload))
            finally:
                loop.close()
        raise
    except Exception as exc:
        print(f"RunPod Flash unavailable: {exc}", file=sys.stderr)
        return None


def post_json(url, body, bearer_token):
    encoded = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=encoded,
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        return read_json_response(request)
    except urllib.error.URLError as exc:
        if "WinError 10013" not in str(exc):
            raise
        return post_bytes_with_curl(
            url,
            encoded,
            {
                "Authorization": f"Bearer {bearer_token}",
                "Content-Type": "application/json",
            },
        )


def post_multipart(url, fields, files, bearer_token):
    boundary = "----agent-boundary-" + uuid.uuid4().hex
    chunks = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(str(value).encode())
        chunks.append(b"\r\n")
    for name, filename, content_type, content in files:
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        chunks.append(f"Content-Type: {content_type}\r\n\r\n".encode())
        chunks.append(content)
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    body = b"".join(chunks)
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(body)),
        },
        method="POST",
    )
    try:
        return read_json_response(request)
    except urllib.error.URLError as exc:
        if "WinError 10013" not in str(exc):
            raise
        return post_bytes_with_curl(
            url,
            body,
            {
                "Authorization": f"Bearer {bearer_token}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )


def read_json_response(request):
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {exc.reason}: {detail}") from exc


def post_bytes_with_curl(url, body, headers):
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(body)
        tmp_path = tmp.name
    try:
        command = ["curl.exe", "-sS", "-X", "POST", url]
        for name, value in headers.items():
            command.extend(["-H", f"{name}: {value}"])
        command.extend(["--data-binary", f"@{tmp_path}"])
        result = subprocess.run(command, capture_output=True, text=True, timeout=240)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "curl.exe request failed")
        return json.loads(result.stdout)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def decode_data_url(data_url):
    match = re.match(r"data:([^;]+);base64,(.*)", data_url or "", flags=re.DOTALL)
    if not match:
        raise ValueError("Expected a base64 data URL")
    return base64.b64decode(match.group(2)), match.group(1)


def collect_output_text(data):
    if isinstance(data, dict) and isinstance(data.get("output_text"), str):
        return data["output_text"]
    texts = []

    def walk(value):
        if isinstance(value, dict):
            if value.get("type") in {"output_text", "text"} and isinstance(value.get("text"), str):
                texts.append(value["text"])
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(data.get("output", data))
    return "\n".join(texts)


def parse_json_text(text):
    if not text:
        raise ValueError("OpenAI response did not include text")
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end >= start:
        text = text[start : end + 1]
    return json.loads(text)


def build_default_edit_prompt(plan):
    return plan.get("editPrompt") or fallback_plan({"id": plan.get("targetId"), "type": plan.get("type")})[
        "editPrompt"
    ]


def main():
    port = int(os.getenv("PORT", "8787"))
    server = ThreadingHTTPServer(("127.0.0.1", port), AgentServer)
    print(f"Serving Image Context Replacer at http://127.0.0.1:{port}")
    print("OPENAI_API_KEY:", "set" if OPENAI_API_KEY else "not set")
    print("RUNPOD_USE_FLASH:", "on" if RUNPOD_USE_FLASH else "off")
    print("RUNPOD_ENDPOINT_ID:", RUNPOD_ENDPOINT_ID or "not set")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
