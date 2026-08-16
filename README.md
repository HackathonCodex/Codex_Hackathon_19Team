# Privacy Image Guard

사진을 업로드하면 개인정보 후보를 찾고, 사용자가 고른 영역을 브라우저에서 블러 처리하는 서비스입니다.

현재 배포 주소: <https://codexcv.duckdns.org/>

## 구성

```text
Browser → Nginx (HTTPS) → web (Nginx 정적 파일)
                         └→ api (FastAPI) → cv (FastAPI) → RunPod endpoint
```

- `apps/web/`: 이미지 업로드·후보 선택·블러 처리 UI
- `apps/api/`: 외부 API. CV 서비스로 분석 요청을 전달
- `services/cv/`: RunPod 분석 endpoint 호출 및 결과 정규화
- `services/runpod-worker/`: RunPod Serverless worker 코드
- `compose.yaml`: web/API/CV 컨테이너 실행 설정

CV 컨테이너는 외부에 공개하지 않습니다. 외부 요청은 HTTPS Nginx를 거쳐 web 또는 API로만 전달됩니다.

## 사용 방법

1. <https://codexcv.duckdns.org/>에서 이미지를 업로드합니다.
2. `AI 분석`을 누릅니다.
3. 탐지 후보 중 가릴 항목을 선택합니다.
4. `선택 가리기`를 누릅니다.

현재 가리기는 브라우저에서 선택 영역을 블러 처리합니다. 실제 탐지 결과는 RunPod endpoint가 반환한 후보를 사용합니다.

## API

| 용도 | 주소 |
| --- | --- |
| 웹 화면 | `GET /` |
| FastAPI 문서 | `GET /docs` |
| OpenAPI 스키마 | `GET /openapi.json` |
| API 상태 | `GET /health` |
| CV 연결 상태 | `GET /health/cv` |
| 이미지 분석 | `POST /api/analyze` |

분석 요청 예시:

```json
{
  "imageDataUrl": "data:image/jpeg;base64,...",
  "width": 1200,
  "height": 800
}
```

`imageDataUrl`은 이미지 data URL이어야 하며, 현재 최대 크기는 16 MiB입니다.

## 로컬 실행

Docker Desktop을 실행한 뒤, 저장소 루트에서 실행합니다.

```bash
docker build -t chanwoongyoon/privacy-image-guard-web:local apps/web
docker build -t chanwoongyoon/privacy-image-guard-api:local apps/api
docker build -t chanwoongyoon/privacy-image-guard-cv:local services/cv

DOCKERHUB_USERNAME=chanwoongyoon IMAGE_TAG=local docker compose up -d
```

접속 주소:

- 웹: <http://localhost:8081>
- FastAPI 문서: <http://localhost:8081/docs>
- API 상태: <http://localhost:8080/health>
- CV 상태: <http://localhost:8080/health/cv>

종료:

```bash
docker compose down
```

RunPod 분석까지 실행하려면 컨테이너 생성 전에 환경변수를 설정합니다.

```bash
export RUNPOD_API_KEY='...'
export RUNPOD_ENDPOINT_ID='...'
DOCKERHUB_USERNAME=chanwoongyoon IMAGE_TAG=local docker compose up -d
```

## EC2 최초 설정

EC2에는 Docker와 Docker Compose, Nginx, Certbot이 필요합니다. 배포 디렉터리를 만들고 `compose.yaml`을 복사합니다.

```bash
sudo install -d -o ec2-user -g ec2-user /opt/codexcv
```

`/opt/codexcv/.env`를 생성합니다. 이 파일은 서버에만 두고 Git에 올리지 않습니다.

```env
DOCKERHUB_USERNAME=chanwoongyoon
IMAGE_TAG=latest
RUNPOD_API_KEY=
RUNPOD_ENDPOINT_ID=
```

배포:

```bash
cd /opt/codexcv
docker compose pull
docker compose up -d
docker compose ps
```

`RUNPOD_API_KEY`와 `RUNPOD_ENDPOINT_ID`를 수정했다면 실행 중인 컨테이너를 다시 만들어야 합니다.

```bash
cd /opt/codexcv
docker compose up -d --force-recreate cv api
```

## Nginx

Nginx는 80/443만 공개합니다. Docker 포트 `8080`, `8081`은 `127.0.0.1`에만 바인딩합니다.

`/etc/nginx/conf.d/codexcv.conf`의 HTTPS 서버는 다음 경로를 프록시해야 합니다.

```nginx
location /api/ { proxy_pass http://127.0.0.1:8080; }
location = /health { proxy_pass http://127.0.0.1:8080; }
location = /health/cv { proxy_pass http://127.0.0.1:8080; }
location = /docs { proxy_pass http://127.0.0.1:8080; }
location = /openapi.json { proxy_pass http://127.0.0.1:8080; }
location / { proxy_pass http://127.0.0.1:8081; }
```

설정 변경 후 적용합니다.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

보안 그룹은 80/443만 공개하고, 22는 운영자 IP로 제한합니다. 8080/8081은 공개하지 않습니다.

## GitHub Actions 자동 배포

`main`에 푸시하면 GitHub Actions가 web/API/CV 이미지를 Docker Hub에 올린 뒤 EC2에서 pull·재기동합니다.

GitHub 저장소의 `Settings` → `Secrets and variables` → `Actions`에 다음 Secret을 설정합니다.

| Secret | 값 |
| --- | --- |
| `DOCKERHUB_USERNAME` | `chanwoongyoon` |
| `DOCKERHUB_TOKEN` | Docker Hub Read & Write PAT |
| `IMAGE_TAG` | 일반적으로 `latest` |
| `EC2_HOST` | EC2 공인 IP 또는 도메인 |
| `EC2_USERNAME` | `ec2-user` |
| `EC2_SSH_KEY_PATH` | PEM 개인키의 전체 내용 |
| `EC2_SSH_KNOWN_HOSTS` | `ssh-keyscan -H <EC2_HOST>` 결과 |

`/opt/codexcv/.env`는 서버 런타임 설정이므로 자동 배포가 덮어쓰지 않습니다. RunPod 키는 GitHub Secret이 아니라 이 서버 `.env`에 유지합니다.

## 문제 해결

### `unconfigured` 또는 "CV 모델 연결 정보가 없어 분석하지 않았습니다"

CV 컨테이너에 RunPod 변수가 전달되지 않은 상태입니다. EC2에서 값 자체를 출력하지 않고 설정 여부만 확인합니다.

```bash
cd /opt/codexcv
docker compose exec cv sh -lc '
[ -n "$RUNPOD_API_KEY" ] && echo "RUNPOD_API_KEY: set" || echo "RUNPOD_API_KEY: missing"
[ -n "$RUNPOD_ENDPOINT_ID" ] && echo "RUNPOD_ENDPOINT_ID: set" || echo "RUNPOD_ENDPOINT_ID: missing"
'
```

둘 중 하나가 `missing`이면 `/opt/codexcv/.env`의 변수명과 값을 확인한 뒤 `docker compose up -d --force-recreate cv api`를 실행합니다.

### `/health/cv`는 성공하지만 실제 분석이 안 됨

`/health/cv`는 API와 CV 컨테이너 간 연결만 확인합니다. RunPod 키, endpoint 상태, worker 모델 실행까지 보장하지는 않습니다.

또한 현재 저장소의 `services/runpod-worker/handler.py`와 `services/flash/agent_gpu.py`는 모델 연결 위치를 안내하는 worker 골격이며, 실제 얼굴·OCR·번호판 모델 추론은 아직 구현돼 있지 않습니다. 실제 CV 모델 코드를 worker에 연결하고 RunPod endpoint로 배포해야 사진 내용에 따른 탐지가 가능합니다.

### 배포 직후 헬스체크가 실패함

Uvicorn 시작 직후 일시적으로 연결이 끊길 수 있습니다. 배포 workflow는 5초 대기 후 재시도하도록 설정돼 있습니다.
