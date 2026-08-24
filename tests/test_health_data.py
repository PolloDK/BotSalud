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
