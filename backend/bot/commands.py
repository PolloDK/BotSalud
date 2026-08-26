# backend/bot/commands.py
from telegram import Update
from telegram.ext import ContextTypes
from services.health_data import (
    get_user_by_telegram_id, create_user, update_objective, get_snapshots_range,
    get_workouts_range, get_recent_workouts, request_sync
)
from services.ai_service import generate_report
from services.chart_service import build_chart, VARIABLE_HELP
from datetime import date, timedelta
import re

SOURCE_NAMES = {
    "com.hevy": "Hevy",
    "com.garmin.android.apps.connectmobile": "Garmin",
    "com.strava": "Strava",
    "com.sec.android.app.shealth": "Samsung Health",
    "com.nutrition.technologies.Fitia": "Fitia",
    "com.eokoe.smartfitcoach": "Smart Fit",
    "com.xiaoxun.xunoversea.mibrofit": "Mibro Fit",
}

def _source_name(pkg: str | None) -> str:
    return SOURCE_NAMES.get(pkg or "", "app")

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        user = create_user(telegram_id)
        msg = (
            f"👋 ¡Bienvenido a BotSalud!\n\n"
            f"Tu token de sincronización es:\n`{user['auth_token']}`\n\n"
            f"Cópialo en la app Android para activar la sincronización automática.\n\n"
            f"Usa /objetivo para configurar tu meta de salud."
        )
    else:
        msg = (
            f"👋 ¡Hola de nuevo!\n\n"
            f"Tu token de sincronización:\n`{user['auth_token']}`\n\n"
            f"Usa /objetivo para ver o actualizar tu meta."
        )
    await update.message.reply_text(msg, parse_mode="Markdown")

async def objetivo_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    args_text = " ".join(context.args) if context.args else ""
    if not args_text:
        current = user.get("objective_text", "Sin objetivo configurado")
        await update.message.reply_text(
            f"🎯 *Tu objetivo actual:*\n{current}\n\n"
            f"Para actualizarlo: `/objetivo llegar a 73kg en enero 2027`",
            parse_mode="Markdown"
        )
        return
    weight_match = re.search(r"(\d+(?:\.\d+)?)\s*kg", args_text)
    target_weight = float(weight_match.group(1)) if weight_match else None
    update_objective(
        user_id=user["id"],
        objective_text=args_text,
        target_weight=target_weight,
        target_date=None
    )
    await update.message.reply_text(f"✅ Objetivo actualizado: _{args_text}_", parse_mode="Markdown")

async def reporte_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    await update.message.reply_text("⏳ Generando tu reporte...")
    end = date.today()
    start = end - timedelta(days=7)
    snapshots = get_snapshots_range(user["id"], start, end)
    if not snapshots:
        await update.message.reply_text("No tengo datos de esta semana aún. Asegúrate de que la app Android esté sincronizando.")
        return
    workouts = get_workouts_range(user["id"], start, end)
    report_text = generate_report(
        snapshots=snapshots,
        objective=user.get("objective_text", "Mejorar salud general"),
        target_weight=user.get("objective_target_weight"),
        target_date=str(user.get("objective_target_date", "")),
        workouts=workouts
    )
    header = f"*📋 Reporte — {end.strftime('%d %b %Y')}*\n\n"
    await update.message.reply_text(header + report_text, parse_mode="Markdown")

async def sincronizar_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    request_sync(user["id"])
    await update.message.reply_text(
        "📲 Sincronización solicitada.\n\n"
        "Abre la app BotSalud en tu teléfono — los datos se enviarán automáticamente.",
        parse_mode="Markdown"
    )

async def semana_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    end = date.today()
    start = end - timedelta(days=7)
    snapshots = get_snapshots_range(user["id"], start, end)
    if not snapshots:
        await update.message.reply_text("Sin datos esta semana.")
        return
    latest = snapshots[-1]
    lines = [f"*📊 Resumen de la semana ({len(snapshots)} días de datos)*\n"]
    if latest.get("weight_kg"):
        lines.append(f"⚖️ Peso más reciente: *{latest['weight_kg']} kg*")
    if latest.get("body_fat_pct"):
        lines.append(f"📉 Grasa corporal: *{latest['body_fat_pct']}%*")
    avg_steps = sum(s.get("steps") or 0 for s in snapshots) // len(snapshots)
    if avg_steps:
        lines.append(f"🚶 Pasos promedio: *{avg_steps:,}*")
    avg_cal = sum(s.get("calories_in") or 0 for s in snapshots) // len(snapshots)
    if avg_cal:
        lines.append(f"🥗 Calorías promedio: *{avg_cal} kcal*")

    def _avg(col):
        vals = [s[col] for s in snapshots if s.get(col) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    rhr = _avg("resting_hr")
    if rhr:
        lines.append(f"❤️ FC reposo promedio: *{rhr:g} bpm*")
    sleep = _avg("sleep_hours")
    if sleep:
        lines.append(f"😴 Sueño promedio: *{sleep:g} h*")
    total_dist = round(sum(s.get("distance_km") or 0 for s in snapshots), 1)
    if total_dist:
        lines.append(f"🏃 Distancia total: *{total_dist:g} km*")
    total_workouts = sum(s.get("workout_count") or 0 for s in snapshots)
    if total_workouts:
        lines.append(f"💪 Entrenamientos: *{total_workouts}*")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def hoy_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    end = date.today()
    snaps = get_snapshots_range(user["id"], end - timedelta(days=2), end)
    s = snaps[-1] if snaps else None
    workouts = get_workouts_range(user["id"], end - timedelta(days=1), end)
    if not s and not workouts:
        await update.message.reply_text("No tengo datos recientes aún. Toca *Sincronizar* en la app.", parse_mode="Markdown")
        return
    day_label = s["date"] if s else str(end)
    lines = [f"*📅 Resumen — {day_label}*\n"]
    if s:
        if s.get("weight_kg"): lines.append(f"⚖️ Peso: *{s['weight_kg']:g} kg*")
        if s.get("steps"): lines.append(f"🚶 Pasos: *{s['steps']:,}*")
        if s.get("distance_km"): lines.append(f"🏃 Distancia: *{s['distance_km']:g} km*")
        if s.get("resting_hr") or s.get("hr_avg"):
            hr = []
            if s.get("resting_hr"): hr.append(f"reposo {s['resting_hr']}")
            if s.get("hr_avg"): hr.append(f"prom {s['hr_avg']}")
            if s.get("hr_max"): hr.append(f"máx {s['hr_max']}")
            lines.append(f"❤️ FC: *{' · '.join(hr)} bpm*")
        if s.get("sleep_hours"):
            extra = ""
            if s.get("sleep_deep_h") or s.get("sleep_rem_h"):
                extra = f" (prof {s.get('sleep_deep_h') or 0:g} / REM {s.get('sleep_rem_h') or 0:g})"
            lines.append(f"😴 Sueño: *{s['sleep_hours']:g} h*{extra}")
        if s.get("calories_in"):
            macros = []
            if s.get("protein_g"): macros.append(f"P{round(s['protein_g'])}")
            if s.get("carbs_g"): macros.append(f"C{round(s['carbs_g'])}")
            if s.get("fat_g"): macros.append(f"G{round(s['fat_g'])}")
            m = f" ({' '.join(macros)})" if macros else ""
            lines.append(f"🥗 Calorías: *{s['calories_in']} kcal*{m}")
    if workouts:
        lines.append("")
        lines.append("*💪 Entrenamientos de hoy:*")
        for w in workouts:
            title = w.get("title") or "Sesión"
            lines.append(f"• {title} · {w.get('duration_min') or '?'} min · {_source_name(w.get('source'))}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def entrenos_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    workouts = get_recent_workouts(user["id"], limit=10)
    if not workouts:
        await update.message.reply_text("No tengo entrenamientos registrados aún.")
        return
    lines = ["*💪 Últimos entrenamientos*\n"]
    for w in workouts:
        title = w.get("title") or "Sesión"
        dur = f"{w['duration_min']} min" if w.get("duration_min") else "?"
        lines.append(f"• {w['date']} — *{title}* · {dur} · {_source_name(w.get('source'))}")
    lines.append("\n_Pregúntame por cualquiera para ver el detalle (ej: \"cómo fue mi último Leg Day\")._")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def grafico_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    variable = " ".join(context.args) if context.args else ""
    if not variable:
        await update.message.reply_text(
            f"📈 Uso: `/grafico <variable>`\n\nVariables: {VARIABLE_HELP}\n\nEjemplo: `/grafico peso`",
            parse_mode="Markdown"
        )
        return
    end = date.today()
    snapshots = get_snapshots_range(user["id"], end - timedelta(days=60), end)
    png, label = build_chart(snapshots, variable)
    if png is None and label is None:
        await update.message.reply_text(
            f"No conozco la variable *{variable}*.\nOpciones: {VARIABLE_HELP}", parse_mode="Markdown"
        )
        return
    if png is None:
        await update.message.reply_text(f"No tengo datos de {label} en los últimos 60 días.")
        return
    await update.message.reply_photo(photo=png, caption=f"📈 {label} — últimos 60 días")
