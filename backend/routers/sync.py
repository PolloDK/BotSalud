# backend/routers/sync.py
from fastapi import APIRouter, HTTPException, Header
from models import HealthSyncPayload
from services.health_data import get_user_by_token, upsert_snapshot

router = APIRouter()

@router.post("/sync")
async def sync_health_data(
    payload: HealthSyncPayload,
    authorization: str | None = Header(default=None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = authorization.removeprefix("Bearer ")
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    upsert_snapshot(user["id"], payload)
    return {"status": "ok"}
