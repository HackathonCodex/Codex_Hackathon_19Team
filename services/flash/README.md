# RunPod Flash

Flash를 쓰면 Docker image를 먼저 만들지 않고도 로컬 Python 함수에 `@Endpoint`를 붙여 RunPod Serverless GPU에서 실행할 수 있습니다.

이 프로젝트에서는 빠른 실험 단계에서 Flash를 우선 사용하고, 해커톤 제출/운영 배포가 필요해지면 `services/runpod-worker` Docker endpoint로 옮기는 전략을 권장합니다.

## 1. 설치

```powershell
pip install runpod-flash
```

또는 RunPod 화면의 안내처럼:

```powershell
npx skills add runpod/runpod-plugins-official
```

## 2. 로그인 또는 API 키 설정

```powershell
flash login
```

또는:

```powershell
$env:RUNPOD_API_KEY="..."
```

## 3. Flash endpoint 실행 테스트

repo 루트에서:

```powershell
C:\Users\82103\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe services\flash\agent_gpu.py
```

처음 실행하면 Flash가 endpoint를 만들고 GPU worker를 준비합니다. 이후 같은 함수를 호출하면 RunPod GPU에서 실행됩니다.

## 4. 배포

```powershell
flash deploy services\flash\agent_gpu.py
```

배포 후 RunPod가 endpoint URL/ID를 보여줍니다. 이 값을 `.env`의 `RUNPOD_ENDPOINT_ID`에 넣으면 기존 `apps/api/server.py`가 REST 방식으로도 호출할 수 있습니다.

## 모델 연결 순서

현재 `agent_gpu.py`는 Flash 연결을 빠르게 검증하기 위한 후보 mock을 반환합니다. 다음 순서로 실제 모델을 연결합니다.

1. InsightFace SCRFD 또는 RetinaFace: 얼굴 탐지
2. Grounding DINO: 간판, 표지판, 번호판, 랜드마크 오픈셋 탐지
3. PaddleOCR PP-OCRv5 Korean: 한국어 간판/표지판 OCR
4. SAM 2: 정밀 마스크 생성

## Agent 서버와 직접 연결

Flash endpoint를 REST endpoint ID 없이 로컬 Agent 서버에서 직접 호출하려면:

```powershell
$env:RUNPOD_USE_FLASH="1"
$env:RUNPOD_API_KEY="..."
C:\Users\82103\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe apps\api\server.py
```

이 상태에서 웹의 `Agent 분석` 버튼을 누르면 `apps/api/server.py`가 `analyze_image_on_gpu()`를 직접 호출합니다.
