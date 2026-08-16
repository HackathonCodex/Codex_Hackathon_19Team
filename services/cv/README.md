# CV Service

이미지 내 개인정보 단서 탐지 서비스입니다.

```bash
docker compose up --build
curl http://localhost:8000/health
```

CV 로직은 이 FastAPI 서비스 안에 추가합니다. 앱 API 서버는 이 서비스의 HTTP API를 호출합니다.
