# Privacy Image Guard

SNS 공유 전 일반 사진 속 얼굴, 간판, 표지판, 차량번호, 랜드마크처럼 사람이나 장소를 특정할 수 있는 시각 단서를 찾아, 블러/모자이크가 아니라 사진 분위기에 맞는 다른 그럴듯한 요소로 자연 치환하는 서비스입니다.

## 현재 실행 가능한 MVP

```powershell
C:\Users\82103\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe apps\api\server.py
```

그 다음 브라우저에서 `http://127.0.0.1:8790`을 엽니다.

## 구조

- `apps/web/`: 브라우저 UI, 캔버스 편집, 후보 선택, 전후 비교
- `apps/api/`: OpenAI/RunPod를 조율하는 Agent API 서버
- `services/runpod-worker/`: RunPod Serverless GPU worker 골격
- `services/flash/`: RunPod Flash로 로컬 함수 기반 GPU endpoint를 빠르게 만드는 실험 경로
- `packages/`: 팀 간 공유 규격
- `infra/`: 컨테이너·배포 설정

## Docker Hub 배포

로컬에서 Docker Hub 계정명을 넣어 이미지를 올립니다.

```bash
export DOCKERHUB_USERNAME=your-dockerhub-id
docker build -t "$DOCKERHUB_USERNAME/privacy-image-guard-api:latest" apps/api
docker build -t "$DOCKERHUB_USERNAME/privacy-image-guard-cv:latest" services/cv
docker push "$DOCKERHUB_USERNAME/privacy-image-guard-api:latest"
docker push "$DOCKERHUB_USERNAME/privacy-image-guard-cv:latest"
```

EC2에서는 이미지만 받아 실행합니다.

```bash
sudo mkdir -p /opt/codexcv
sudo chown ec2-user:ec2-user /opt/codexcv
cd /opt/codexcv
printf 'DOCKERHUB_USERNAME=chanwoongyoon\nIMAGE_TAG=latest\n' > .env
docker compose pull
docker compose up -d
```

## 자동 배포

GitHub 저장소의 `Settings` → `Secrets and variables` → `Actions`에 아래 Secrets를 추가합니다.

- `DOCKERHUB_USERNAME`: `chanwoongyoon`
- `DOCKERHUB_TOKEN`: Docker Hub Read & Write PAT
- `IMAGE_TAG`: `latest`
- `EC2_HOST`: EC2의 공인 IP 또는 도메인
- `EC2_USERNAME`: `ec2-user`
- `EC2_SSH_KEY_PATH`: EC2 접속 PEM 개인키의 **전체 내용**
- `EC2_SSH_KNOWN_HOSTS`: `ssh-keyscan -H <EC2_HOST>` 출력

`main` 푸시 시 API·CV 이미지를 Docker Hub로 푸시한 뒤, EC2의 `/opt/codexcv`에서 새 태그를 pull·재기동하고 CV 헬스체크까지 확인합니다. GitHub Actions가 EC2 SSH에 접근할 수 있도록 보안 그룹도 설정해야 합니다.

## Agent 결합 방식

- `Agent 분석`: 이미지 맥락을 읽고 얼굴/간판/표지판/번호판/랜드마크 후보를 정리
- `Agent 계획만`: 후보별 OpenAI 이미지 편집 프롬프트를 생성
- `선택 치환`: OpenAI image edit API가 있으면 마스크 기반 자연 치환, 없으면 로컬 데모 치환
- `결과 검수`: 남은 식별 단서와 합성 품질을 Agent가 재검토

자세한 구조는 `AGENT_ARCHITECTURE.md`를 참고하세요.

## RunPod 선택

빠른 실험은 Flash를 권장합니다.

```powershell
python services\flash\agent_gpu.py
```

GitHub/Docker 기반의 안정적인 배포는 `services/runpod-worker/Dockerfile`을 사용합니다.

로컬 Agent 서버에서 Flash를 우선 사용하려면:

```powershell
.\run_flash_server.ps1
```

키는 현재 PowerShell 환경변수 또는 repo 루트의 `.env`에서 읽습니다.
