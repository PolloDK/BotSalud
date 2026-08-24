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
