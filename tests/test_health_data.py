# tests/test_health_data.py
import pytest
from unittest.mock import MagicMock, patch
from datetime import date
from models import HealthSyncPayload

@pytest.fixture
def mock_db():
    db = MagicMock()
    db.table.return_value.upsert.return_value.execute.return_value.data = [{"id": "uuid-1"}]
    db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "id": "user-uuid", "telegram_id": 123456, "auth_token": "token-abc"
    }
    return db

def test_upsert_snapshot(mock_db):
    from services.health_data import upsert_snapshot
    payload = HealthSyncPayload(date=date(2026, 8, 24), weight_kg=80.5, steps=8000)
    with patch("services.health_data.get_db", return_value=mock_db):
        result = upsert_snapshot("user-uuid", payload)
    assert result == [{"id": "uuid-1"}]
    mock_db.table.assert_called_with("health_snapshots")

def test_get_user_by_token(mock_db):
    from services.health_data import get_user_by_token
    with patch("services.health_data.get_db", return_value=mock_db):
        user = get_user_by_token("token-abc")
    assert user["telegram_id"] == 123456

def test_get_snapshots_range(mock_db):
    from services.health_data import get_snapshots_range
    mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = []
    with patch("services.health_data.get_db", return_value=mock_db):
        result = get_snapshots_range("user-uuid", date(2026, 8, 17), date(2026, 8, 24))
    assert result == []

def test_upsert_snapshot_excludes_workouts(mock_db):
    from services.health_data import upsert_snapshot
    from models import HealthSyncPayload, WorkoutIn
    payload = HealthSyncPayload(date=date(2026, 8, 24), steps=8000,
                                workouts=[WorkoutIn(hc_id="abc")])
    captured = {}
    def _upsert(data, on_conflict=None):
        captured["data"] = data
        m = MagicMock(); m.execute.return_value.data = [{"id": "uuid-1"}]; return m
    mock_db.table.return_value.upsert.side_effect = _upsert
    with patch("services.health_data.get_db", return_value=mock_db):
        upsert_snapshot("user-uuid", payload)
    assert "workouts" not in captured["data"]  # must not go into health_snapshots
    assert captured["data"]["steps"] == 8000

def test_upsert_workouts(mock_db):
    from services.health_data import upsert_workouts
    from models import WorkoutIn
    from datetime import date
    captured = {}
    def _upsert(rows, on_conflict=None):
        captured["rows"] = rows; captured["on_conflict"] = on_conflict
        m = MagicMock(); m.execute.return_value.data = [{"id": "w1"}]; return m
    mock_db.table.return_value.upsert.side_effect = _upsert
    with patch("services.health_data.get_db", return_value=mock_db):
        upsert_workouts("user-uuid", date(2026, 8, 24),
                        [WorkoutIn(hc_id="abc", title="Pull Day")])
    assert captured["on_conflict"] == "user_id,hc_uuid"
    assert captured["rows"][0]["hc_uuid"] == "abc"
    assert captured["rows"][0]["user_id"] == "user-uuid"
    assert captured["rows"][0]["date"] == "2026-08-24"
    assert "hc_id" not in captured["rows"][0]


def test_get_workouts_range(mock_db):
    from services.health_data import get_workouts_range
    mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = [
        {"date": "2026-08-24", "title": "Leg Day", "detail": "Squat 80x7"}
    ]
    with patch("services.health_data.get_db", return_value=mock_db):
        result = get_workouts_range("user-uuid", date(2026, 8, 1), date(2026, 8, 26))
    assert result[0]["title"] == "Leg Day"
    mock_db.table.assert_called_with("workouts")


def test_get_recent_workouts(mock_db):
    from services.health_data import get_recent_workouts
    mock_db.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        {"date": "2026-08-24", "title": "Leg Day", "duration_min": 48, "source": "com.hevy"}
    ]
    with patch("services.health_data.get_db", return_value=mock_db):
        result = get_recent_workouts("user-uuid", limit=10)
    assert result[0]["title"] == "Leg Day"
    mock_db.table.assert_called_with("workouts")
