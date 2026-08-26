# backend/services/health_data.py
from datetime import date
from database import get_db
from models import HealthSyncPayload

def upsert_snapshot(user_id: str, payload: HealthSyncPayload) -> list:
    data = payload.model_dump(exclude_none=True, exclude={"workouts"})
    data["user_id"] = user_id
    data["date"] = str(data["date"])
    return get_db().table("health_snapshots").upsert(data, on_conflict="user_id,date").execute().data

def upsert_workouts(user_id: str, day, workouts: list) -> list:
    if not workouts:
        return []
    rows = []
    for w in workouts:
        row = w.model_dump(exclude_none=True)
        row["hc_uuid"] = row.pop("hc_id")
        row["user_id"] = user_id
        row["date"] = str(day)
        if row.get("start_time"):
            row["start_time"] = str(row["start_time"])
        if row.get("end_time"):
            row["end_time"] = str(row["end_time"])
        rows.append(row)
    return get_db().table("workouts").upsert(rows, on_conflict="user_id,hc_uuid").execute().data

def get_user_by_token(token: str) -> dict | None:
    return get_db().table("users").select("*").eq("auth_token", token).single().execute().data

def get_user_by_telegram_id(telegram_id: int) -> dict | None:
    result = get_db().table("users").select("*").eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None

def create_user(telegram_id: int) -> dict:
    return get_db().table("users").insert({"telegram_id": telegram_id}).execute().data[0]

def update_objective(user_id: str, objective_text: str, target_weight: float | None, target_date: date | None) -> dict:
    data = {"objective_text": objective_text}
    if target_weight:
        data["objective_target_weight"] = target_weight
    if target_date:
        data["objective_target_date"] = str(target_date)
    return get_db().table("users").update(data).eq("id", user_id).execute().data[0]

def get_snapshots_range(user_id: str, start: date, end: date) -> list:
    return (
        get_db().table("health_snapshots")
        .select("*")
        .eq("user_id", user_id)
        .gte("date", str(start))
        .lte("date", str(end))
        .order("date", desc=False)
        .execute()
        .data
    )

def save_message(user_id: str, role: str, content: str) -> None:
    get_db().table("messages").insert({"user_id": user_id, "role": role, "content": content}).execute()

def get_recent_messages(user_id: str, limit: int = 10) -> list:
    return (
        get_db().table("messages")
        .select("role,content")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data[::-1]
    )

def request_sync(user_id: str) -> None:
    from datetime import datetime, timezone
    get_db().table("users").update(
        {"sync_requested_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", user_id).execute()

def clear_sync_request(user_id: str) -> None:
    get_db().table("users").update(
        {"sync_requested_at": None}
    ).eq("id", user_id).execute()

def is_sync_pending(user_id: str) -> bool:
    result = get_db().table("users").select("sync_requested_at").eq("id", user_id).single().execute()
    return bool(result.data and result.data.get("sync_requested_at"))
