# CV Service

이미지 내 개인정보 단서 탐지 서비스입니다.

```bash
docker compose up --build
curl http://localhost:8000/health
```

`POST /analyze`는 RunPod의 `runsync` endpoint를 호출해 후보를 반환합니다. `RUNPOD_API_KEY`와 `RUNPOD_ENDPOINT_ID`가 없으면 업로드 이미지에는 후보를 만들지 않습니다.

앱 API 서버는 이 서비스의 HTTP API를 호출합니다.
