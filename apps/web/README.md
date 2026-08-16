# Web

정적 웹 화면입니다. Compose는 이 화면을 `127.0.0.1:8081`에 열고, 호스트 Nginx가 외부 HTTPS를 처리합니다.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8080;
}

location / {
    proxy_pass http://127.0.0.1:8081;
}
```

`/docs`와 `/openapi.json`은 API 컨테이너(`127.0.0.1:8080`)로 별도 프록시합니다.

이미지 업로드, 탐지 결과 검토, 결과 이미지 다운로드 화면을 둡니다.
