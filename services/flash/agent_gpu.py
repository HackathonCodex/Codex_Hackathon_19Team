import asyncio
import uuid

from runpod_flash import Endpoint, GpuGroup


@Endpoint(
    name="privacy-image-guard-smoke-v3",
    gpu=GpuGroup.ANY,
    workers=(0, 2),
    idle_timeout=300,
    dependencies=[],
)
async def analyze_image_on_gpu(
    image_data_url: str = "",
    width: int = 1200,
    height: int = 760,
    operation: str = "analyze",
    **_: dict,
) -> dict:
    width = int(width)
    height = int(height)

    if not image_data_url.startswith("data:image"):
        return {"error": "image_data_url must be a base64 data URL"}

    # Current Flash smoke-test output. Replace this block with:
    # 1. InsightFace SCRFD / RetinaFace face boxes
    # 2. Grounding DINO open-vocabulary sign/plate/landmark boxes
    # 3. PaddleOCR Korean text boxes
    # 4. SAM 2 masks when needed
    return {
        "scene": f"Flash GPU endpoint received canvas {width}x{height}",
        "candidates": [
            candidate("store_sign", width * 0.18, height * 0.18, width * 0.28, height * 0.12, "Flash 후보: 간판/표지판"),
            candidate("face", width * 0.55, height * 0.24, width * 0.08, width * 0.08, "Flash 후보: 얼굴"),
        ],
    }


def candidate(kind: str, x: float, y: float, w: float, h: float, reason: str) -> dict:
    return {
        "id": f"{kind}_{uuid.uuid4().hex[:8]}",
        "type": kind,
        "x": round(x),
        "y": round(y),
        "w": round(w),
        "h": round(h),
        "risk": "medium",
        "reason": reason,
        "selected": True,
    }


async def main() -> None:
    # Local smoke test. Use a tiny 1x1 PNG so endpoint creation/calling can be verified fast.
    sample = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    )
    result = await analyze_image_on_gpu(
        image_data_url=sample,
        width=1200,
        height=760,
    )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
