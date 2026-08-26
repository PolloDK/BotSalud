# backend/services/chart_service.py
"""Local (matplotlib) chart generation — health data never leaves the backend."""
import io
import re
import unicodedata
from datetime import datetime

import matplotlib
matplotlib.use("Agg")  # headless
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

# normalised alias (no accents, lowercase, alnum only) -> (snapshot column, label)
_VARS: dict[str, tuple[str, str]] = {
    "peso": ("weight_kg", "Peso (kg)"),
    "grasa": ("body_fat_pct", "Grasa corporal (%)"),
    "grasacorporal": ("body_fat_pct", "Grasa corporal (%)"),
    "masamagra": ("lean_mass_kg", "Masa magra (kg)"),
    "masa": ("lean_mass_kg", "Masa magra (kg)"),
    "fc": ("resting_hr", "FC en reposo (bpm)"),
    "fcreposo": ("resting_hr", "FC en reposo (bpm)"),
    "reposo": ("resting_hr", "FC en reposo (bpm)"),
    "fcpromedio": ("hr_avg", "FC promedio (bpm)"),
    "fcprom": ("hr_avg", "FC promedio (bpm)"),
    "fcmax": ("hr_max", "FC máxima (bpm)"),
    "fcmaxima": ("hr_max", "FC máxima (bpm)"),
    "pasos": ("steps", "Pasos"),
    "distancia": ("distance_km", "Distancia (km)"),
    "calorias": ("calories_in", "Calorías ingeridas (kcal)"),
    "caloriasingeridas": ("calories_in", "Calorías ingeridas (kcal)"),
    "caloriasactivas": ("active_cal", "Calorías activas (kcal)"),
    "activas": ("active_cal", "Calorías activas (kcal)"),
    "proteina": ("protein_g", "Proteína (g)"),
    "sueno": ("sleep_hours", "Sueño (horas)"),
    "dormir": ("sleep_hours", "Sueño (horas)"),
}

# Human-facing list of what /grafico accepts.
VARIABLE_HELP = (
    "peso, grasa, masa magra, fc reposo, fc promedio, fc max, pasos, "
    "distancia, calorías, calorías activas, proteína, sueño"
)


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def resolve_variable(name: str) -> tuple[str, str] | None:
    return _VARS.get(_norm(name))


def build_chart(snapshots: list, variable: str) -> tuple[bytes | None, str | None]:
    """Return (png_bytes, label). (None, None)=unknown variable; (None, label)=no data."""
    resolved = resolve_variable(variable)
    if not resolved:
        return None, None
    column, label = resolved

    points = [
        (s["date"], s[column])
        for s in snapshots
        if s.get("date") and s.get(column) is not None
    ]
    if not points:
        return None, label

    dates = [datetime.strptime(d, "%Y-%m-%d") for d, _ in points]
    values = [v for _, v in points]

    fig, ax = plt.subplots(figsize=(7, 3.6), dpi=110)
    ax.plot(dates, values, marker="o", linewidth=2, color="#00B383")
    ax.set_title(label)
    ax.grid(True, alpha=0.3)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d/%m"))
    fig.autofmt_xdate(rotation=45)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue(), label
