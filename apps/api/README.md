# API

이미지 분석 요청과 편집 결과 제공, 즉시 삭제를 담당하는 백엔드입니다.

- `app/`: FastAPI 애플리케이션
- `src/`: 이후 도메인 로직을 둘 위치
- `tests/`: API 테스트

Docker Compose로 실행하면 API는 `http://localhost:8080`, CV 서비스는 내부 네트워크에서만 접근합니다.
