import json
import os
import urllib.error
import urllib.request

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Privacy Image Guard CV")

MAX_IMAGE_DATA_URL_SIZE = 16 * 1024 * 1024
ALLOWED_TYPES = {"face", "store_sign", "road_sign", "license_plate", "landmark"}


class AnalysisRequest(BaseModel):
    imageDataUrl: str
    width: int = Field(ge=1, le=10000)
    height: int = Field(ge=1, le=10000)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
def analyze(request: AnalysisRequest) -> dict:
    if not request.imageDataUrl.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="imageDataUrl must be an image data URL")
    if len(request.imageDataUrl) > MAX_IMAGE_DATA_URL_SIZE:
        raise HTTPException(status_code=413, detail="image is too large")

    endpoint_id = os.getenv("RUNPOD_ENDPOINT_ID")
    api_key = os.getenv("RUNPOD_API_KEY")
    if not endpoint_id or not api_key:
        return {
            "provider": "unconfigured",
            "summary": "CV 모델 연결 정보가 없어 분석하지 않았습니다.",
            "candidates": [],
        }

    payload = {
        "input": {
            "operation": "analyze",
            "image_data_url": request.imageDataUrl,
            "width": request.width,
            "height": request.height,
        }
    }
    http_request = urllib.request.Request(
        f"https://api.runpod.ai/v2/{endpoint_id}/runsync",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(http_request, timeout=45) as response:
            data = json.loads(response.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
        raise HTTPException(status_code=502, detail="CV analysis service is unavailable") from error

    output = data.get("output") or data.get("result") or {}
    return {
        "provider": "runpod",
        "summary": output.get("scene", "CV 분석이 완료되었습니다."),
        "scene": output.get("scene", ""),
        "candidates": normalize_candidates(output.get("candidates", []), request.width, request.height),
    }


def normalize_candidates(items: list[dict], width: int, height: int) -> list[dict]:
    candidates = []
    for index, item in enumerate(items):
        kind = item.get("type")
        if kind not in ALLOWED_TYPES:
            continue
        x = max(0, min(width - 1, round(float(item.get("x", 0)))))
        y = max(0, min(height - 1, round(float(item.get("y", 0)))))
        w = max(8, min(width - x, round(float(item.get("w", 8)))))
        h = max(8, min(height - y, round(float(item.get("h", 8)))))
        candidates.append(
            {
                "id": item.get("id") or f"{kind}_{index + 1}",
                "type": kind,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "risk": item.get("risk", "medium"),
                "reason": item.get("reason", "개인정보 단서 후보"),
                "selected": item.get("selected", True),
            }
        )
    return candidates


if __name__ == "__main__":
    assert normalize_candidates([{"type": "face", "x": -1, "y": 2, "w": 20, "h": 20}], 100, 100)[0]["x"] == 0
