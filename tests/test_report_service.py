# tests/test_report_service.py
import pytest
from unittest.mock import patch, AsyncMock
from datetime import date

def test_generate_weekly_report_for_all_users():
    from services.report_service import generate_and_send_weekly_reports
    mock_users = [
        {"id": "user-1", "telegram_id": 111, "objective_text": "75kg diciembre",
         "objective_target_weight": 75.0, "objective_target_date": "2026-12-31"}
    ]
    mock_snapshots = [{"date": "2026-08-24", "weight_kg": 80.5, "steps": 8000}]
    with patch("services.report_service.get_db") as mock_db, \
         patch("services.report_service.get_snapshots_range", return_value=mock_snapshots), \
         patch("services.report_service.generate_report", return_value="📊 Reporte..."), \
         patch("services.report_service.send_message", new_callable=AsyncMock) as mock_send:
        mock_db.return_value.table.return_value.select.return_value.execute.return_value.data = mock_users
        import asyncio
        asyncio.run(generate_and_send_weekly_reports())
        mock_send.assert_called_once()
        args = mock_send.call_args
        assert args.kwargs["chat_id"] == 111
        assert "Reporte" in args.kwargs["text"]
