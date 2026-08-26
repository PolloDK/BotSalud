# tests/test_chart_service.py
from services.chart_service import resolve_variable, build_chart

def test_resolve_variable_accent_insensitive():
    assert resolve_variable("peso")[0] == "weight_kg"
    assert resolve_variable("Sueño")[0] == "sleep_hours"
    assert resolve_variable("FC reposo")[0] == "resting_hr"
    assert resolve_variable("proteína")[0] == "protein_g"
    assert resolve_variable("no-existe") is None

def test_build_chart_returns_png_bytes_with_data():
    snaps = [
        {"date": "2026-08-20", "weight_kg": 83.5},
        {"date": "2026-08-22", "weight_kg": 83.1},
        {"date": "2026-08-24", "weight_kg": 82.8},
    ]
    png, label = build_chart(snaps, "peso")
    assert label == "Peso (kg)"
    assert png is not None and png[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic

def test_build_chart_unknown_variable():
    png, label = build_chart([], "xyz")
    assert png is None and label is None

def test_build_chart_no_data():
    png, label = build_chart([{"date": "2026-08-20"}], "peso")
    assert png is None and label == "Peso (kg)"
