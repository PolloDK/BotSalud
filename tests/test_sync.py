# tests/test_sync.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

@pytest.fixture
def client():
    from main import app
    return TestClient(app)

def test_sync_missing_auth_returns_401(client):
    response = client.post("/sync", json={"date": "2026-08-24"})
    assert response.status_code == 401

def test_sync_invalid_token_returns_401(client):
    with patch("routers.sync.get_user_by_token", return_value=None):
        response = client.post(
            "/sync",
            json={"date": "2026-08-24", "weight_kg": 80.5},
            headers={"Authorization": "Bearer bad-token"}
        )
    assert response.status_code == 401

def test_sync_valid_request_returns_200(client):
    mock_user = {"id": "user-uuid", "telegram_id": 123}
    with patch("routers.sync.get_user_by_token", return_value=mock_user), \
         patch("routers.sync.upsert_snapshot", return_value=[{"id": "snap-uuid"}]), \
         patch("routers.sync.clear_sync_request"):
        response = client.post(
            "/sync",
            json={"date": "2026-08-24", "weight_kg": 80.5, "steps": 8000},
            headers={"Authorization": "Bearer valid-token"}
        )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_sync_with_workouts_upserts_both(client):
    mock_user = {"id": "user-uuid", "telegram_id": 123}
    with patch("routers.sync.get_user_by_token", return_value=mock_user), \
         patch("routers.sync.upsert_snapshot", return_value=[{"id": "snap"}]) as m_snap, \
         patch("routers.sync.upsert_workouts", return_value=[{"id": "w1"}]) as m_wk, \
         patch("routers.sync.clear_sync_request"):
        response = client.post(
            "/sync",
            json={"date": "2026-08-24", "steps": 8000,
                  "workouts": [{"hc_id": "abc", "title": "Pull Day"}]},
            headers={"Authorization": "Bearer valid-token"},
        )
    assert response.status_code == 200
    m_snap.assert_called_once()
    m_wk.assert_called_once()
