import uuid

import runpod


MODEL_HINTS = {
    "face": "InsightFace SCRFD or RetinaFace",
    "open_vocab": "Grounding DINO",
    "ocr": "PaddleOCR PP-OCRv5 Korean",
    "mask": "SAM 2",
}


def handler(job):
    job_input = job.get("input", {})
    operation = job_input.get("operation", "analyze")
    if operation != "analyze":
        return {"error": f"Unsupported operation: {operation}"}

    image_data_url = job_input.get("image_data_url")
    width = int(job_input.get("width", 1200))
    height = int(job_input.get("height", 760))

    if not image_data_url:
        return {"error": "image_data_url is required"}

    # Production model wiring:
    # 1. SCRFD/RetinaFace finds faces.
    # 2. Grounding DINO finds signs, plates, banners, landmarks from text prompts.
    # 3. PaddleOCR reads text crops and whole-image text boxes.
    # 4. SAM 2 turns boxes into precise masks when mask URLs are needed.
    # Keep heavy model initialization at module scope once dependencies are installed.
    return {
        "scene": "RunPod worker skeleton is reachable. Replace mock candidates with model outputs.",
        "modelHints": MODEL_HINTS,
        "candidates": [
            candidate("store_sign", width * 0.18, height * 0.18, width * 0.28, height * 0.12, "GPU worker mock: sign candidate", "medium"),
            candidate("face", width * 0.55, height * 0.24, width * 0.08, width * 0.08, "GPU worker mock: face candidate", "medium"),
        ],
    }


def candidate(kind, x, y, w, h, reason, risk):
    return {
        "id": f"{kind}_{uuid.uuid4().hex[:8]}",
        "type": kind,
        "x": round(x),
        "y": round(y),
        "w": round(w),
        "h": round(h),
        "risk": risk,
        "reason": reason,
        "selected": True,
    }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
