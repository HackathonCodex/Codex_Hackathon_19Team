from fastapi import FastAPI

app = FastAPI(title="Privacy Image Guard CV")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
