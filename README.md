# Privacy Image Guard

SNS 공유 전 사진 속 위치·연락처·차량번호 등 개인정보 단서를 찾아 사용자가 가리거나 익명 텍스트로 바꿀 수 있게 하는 서비스입니다.

- `apps/`: 사용자용 웹과 백엔드
- `services/`: 독립 분석 서비스
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
