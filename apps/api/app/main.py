import os
from urllib.request import urlopen

from fastapi import FastAPI, HTTPException

app = FastAPI(title="Privacy Image Guard API")
CV_URL = os.getenv("CV_URL", "http://cv:8000")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/cv")
def cv_health() -> dict[str, str]:
    try:
        with urlopen(f"{CV_URL}/health", timeout=3) as response:
            if response.status != 200:
                raise OSError
    except OSError as error:
        raise HTTPException(status_code=503, detail="CV service unavailable") from error
    return {"status": "ok"}
