# backend/main.py
from fastapi import FastAPI
from routers.sync import router as sync_router

app = FastAPI(title="BotSalud")
app.include_router(sync_router)

@app.get("/health")
async def health():
    return {"status": "ok"}
