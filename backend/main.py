# backend/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from routers.sync import router as sync_router
from cron import setup_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = setup_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(title="BotSalud", lifespan=lifespan)
app.include_router(sync_router)

@app.get("/health")
async def health():
    return {"status": "ok"}
