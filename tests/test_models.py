from models import HealthSyncPayload, HealthSnapshot

def test_health_sync_payload_parses():
    payload = HealthSyncPayload(
        date="2026-08-24",
        weight_kg=80.5,
        body_fat_pct=22.1,
        steps=8000,
        calories_in=2100,
        protein_g=150.0,
        carbs_g=200.0,
        fat_g=70.0,
    )
    assert payload.weight_kg == 80.5
    assert payload.date.isoformat() == "2026-08-24"

def test_workout_in_and_payload_workouts():
    from models import HealthSyncPayload, WorkoutIn
    from datetime import date
    p = HealthSyncPayload(
        date=date(2026, 8, 24),
        hr_avg=72, hr_min=48, hr_max=150,
        distance_km=8.2, floors=12, elevation_m=45.0,
        sleep_light_h=4.1, fiber_g=30.0, sugar_g=40.0, sodium_mg=2300.0, sat_fat_g=12.0,
        workouts=[WorkoutIn(hc_id="abc", title="Pull Day", exercise_type=45,
                            duration_min=35, detail="Set 1: 54 kg x 12", source="com.hevy")],
    )
    assert p.hr_avg == 72
    assert p.workouts[0].hc_id == "abc"
