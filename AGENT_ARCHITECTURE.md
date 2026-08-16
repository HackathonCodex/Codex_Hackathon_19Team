# Agent Architecture

이 프로젝트의 Agent는 이미지 생성 모델을 단순 호출하는 래퍼가 아니라, 자연 치환 품질을 책임지는 편집 감독입니다.

## Runtime Flow

```text
Browser canvas
  -> POST /api/agent/analyze
     -> RunPod GPU worker if configured
     -> OpenAI vision agent if configured
     -> local fallback otherwise
  -> user keeps/removes candidates
  -> POST /api/agent/replace
     -> OpenAI edit-plan prompt generation
     -> OpenAI image edit with per-target masks
     -> local canvas fallback otherwise
  -> POST /api/agent/verify
     -> OpenAI vision verifier
     -> local status fallback otherwise
```

## Agent Responsibilities

- Read the whole image mood: daylight/night, weather, lens distance, focus, grain, color temperature.
- Convert raw detector output into user-facing replacement candidates.
- Decide what each candidate should become: different face, fictional Korean sign, fictional road sign, invalid plate, generic background.
- Generate precise image-edit prompts that preserve lighting, perspective, material, and surrounding context.
- Prevent low-quality privacy edits: blur, mosaic, black boxes, global style shifts, cartoon-like output.
- Verify whether location/person clues remain after editing.

## Model Boundaries

| Layer | Primary model/service | Why |
| --- | --- | --- |
| Face detection | InsightFace SCRFD / RetinaFace on RunPod | Fast, focused face boxes |
| Open-vocabulary object detection | Grounding DINO on RunPod | Finds signboards, landmarks, unusual location clues without fine-tuning |
| OCR | PaddleOCR PP-OCRv5 Korean on RunPod | Korean storefront and road-sign text |
| Precise masks | SAM 2 on RunPod | Converts boxes into edit-ready masks |
| Image reasoning/planning | OpenAI Responses vision model | Reads context and writes target-specific prompts |
| Natural replacement | OpenAI image edits | Produces non-blurred photorealistic replacement inside masks |
| Verification | OpenAI vision model + repeated OCR/detection | Checks if clues remain |

## RunPod Integration Options

- Flash: `services/flash/agent_gpu.py`
  - Best for fast experiments.
  - Local Python function becomes a GPU endpoint through `@Endpoint`.
  - Use this while testing InsightFace, Grounding DINO, PaddleOCR, and SAM 2 combinations.
- Docker Serverless worker: `services/runpod-worker/`
  - Best for stable GitHub-connected deployment.
  - Use this once model loading and dependency versions are fixed.

## API Contracts

### `/api/agent/analyze`

Input:

```json
{
  "imageDataUrl": "data:image/png;base64,...",
  "width": 1200,
  "height": 760
}
```

Output:

```json
{
  "provider": "runpod+openai",
  "summary": "식별 단서 후보를 찾았습니다.",
  "scene": "warm street photo",
  "candidates": [],
  "editPlans": []
}
```

### `/api/agent/replace`

Input:

```json
{
  "imageDataUrl": "data:image/png;base64,...",
  "candidates": [],
  "masks": [{ "id": "face_1", "maskDataUrl": "data:image/png;base64,..." }]
}
```

Output:

```json
{
  "provider": "openai-image-edit",
  "summary": "마스크 영역을 자연 치환했습니다.",
  "resultImageDataUrl": "data:image/png;base64,...",
  "editPlans": []
}
```

## Environment Variables

- `OPENAI_API_KEY`
- `OPENAI_AGENT_MODEL`
- `OPENAI_IMAGE_MODEL`
- `RUNPOD_API_KEY`
- `RUNPOD_ENDPOINT_ID`
- `PORT`
