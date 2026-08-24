from datetime import date
from pydantic import BaseModel


class HealthSyncPayload(BaseModel):
    date: date
    weight_kg: float | None = None
    body_fat_pct: float | None = None
    lean_mass_kg: float | None = None
    bone_mass_kg: float | None = None
    water_pct: float | None = None
    steps: int | None = None
    active_cal: int | None = None
    total_cal: int | None = None
    resting_hr: int | None = None
    sleep_hours: float | None = None
    sleep_deep_h: float | None = None
    sleep_rem_h: float | None = None
    workout_count: int | None = None
    workout_minutes: int | None = None
    calories_in: int | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    raw_json: dict | None = None


class HealthSnapshot(HealthSyncPayload):
    id: str
    user_id: str


class ObjectiveUpdate(BaseModel):
    objective_text: str
    target_weight: float | None = None
    target_date: date | None = None


class TelegramUpdate(BaseModel):
    update_id: int
    message: dict | None = None
