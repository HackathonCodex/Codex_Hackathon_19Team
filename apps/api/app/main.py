import json
import os
import urllib.error
import urllib.request

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Privacy Image Guard API")
CV_URL = os.getenv("CV_URL", "http://cv:8000")


class AnalysisRequest(BaseModel):
    imageDataUrl: str
    width: int = Field(ge=1, le=10000)
    height: int = Field(ge=1, le=10000)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/cv")
def cv_health() -> dict[str, str]:
    try:
        with urllib.request.urlopen(f"{CV_URL}/health", timeout=3) as response:
            if response.status != 200:
                raise OSError
    except OSError as error:
        raise HTTPException(status_code=503, detail="CV service unavailable") from error
    return {"status": "ok"}


@app.post("/api/analyze")
def analyze(request: AnalysisRequest) -> dict:
    http_request = urllib.request.Request(
        f"{CV_URL}/analyze",
        data=request.model_dump_json().encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(http_request, timeout=50) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise HTTPException(status_code=error.code, detail="CV analysis failed") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise HTTPException(status_code=503, detail="CV service unavailable") from error
