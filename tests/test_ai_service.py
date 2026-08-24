# tests/test_ai_service.py
import pytest
from unittest.mock import patch, MagicMock

def make_mock_openai_response(text: str):
    mock = MagicMock()
    mock.choices[0].message.content = text
    return mock

def test_answer_question():
    from services.ai_service import answer_question
    snapshots = [{"date": "2026-08-24", "weight_kg": 80.5, "calories_in": 2100}]
    history = [{"role": "user", "content": "hola"}]
    with patch("services.ai_service.client") as mock_client:
        mock_client.chat.completions.create.return_value = make_mock_openai_response("Comiste 2100 kcal ayer.")
        result = answer_question(
            question="¿Cuánto comí ayer?",
            snapshots=snapshots,
            history=history,
            objective="Llegar a 75kg en diciembre 2026"
        )
    assert "2100" in result

def test_generate_report():
    from services.ai_service import generate_report
    snapshots = [{"date": "2026-08-24", "weight_kg": 80.5}]
    with patch("services.ai_service.client") as mock_client:
        mock_client.chat.completions.create.return_value = make_mock_openai_response("📊 Tu reporte...")
        result = generate_report(
            snapshots=snapshots,
            objective="Llegar a 75kg en diciembre 2026",
            target_weight=75.0,
            target_date="2026-12-31"
        )
    assert "reporte" in result.lower()
