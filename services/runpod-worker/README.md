# RunPod Worker

GPU 탐지/OCR/마스크 생성을 위한 Serverless worker 골격입니다.

## 목표 모델

- 얼굴: InsightFace SCRFD 또는 RetinaFace
- 오픈셋 탐지: Grounding DINO
- OCR: PaddleOCR PP-OCRv5 Korean
- 정밀 마스크: SAM 2
- 보조 객체 탐지: YOLO pretrained

현재 `handler.py`는 배포 연결을 먼저 검증하기 위한 mock candidate를 반환합니다. 다음 단계에서 각 모델 초기화를 모듈 스코프에 두고, `handler()` 내부에서 실제 후보를 병합하면 됩니다.

## RunPod 입력

```json
{
  "input": {
    "operation": "analyze",
    "image_data_url": "data:image/png;base64,...",
    "width": 1200,
    "height": 760,
    "prompts": ["face", "store sign", "road sign", "license plate"]
  }
}
```

## 출력

```json
{
  "scene": "street photo",
  "candidates": [
    {
      "id": "store_sign_1",
      "type": "store_sign",
      "x": 100,
      "y": 335,
      "w": 230,
      "h": 72,
      "risk": "high",
      "reason": "식당 상호 간판"
    }
  ]
}
```
