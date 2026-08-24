# backend/bot/commands.py
from telegram import Update
from telegram.ext import ContextTypes
from services.health_data import (
    get_user_by_telegram_id, create_user, update_objective, get_snapshots_range, request_sync
)
from services.ai_service import generate_report
from datetime import date, timedelta
import re

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
    report_text = generate_report(
        snapshots=snapshots,
        objective=user.get("objective_text", "Mejorar salud general"),
        target_weight=user.get("objective_target_weight"),
        target_date=str(user.get("objective_target_date", ""))
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
    total_workouts = sum(s.get("workout_count") or 0 for s in snapshots)
    if total_workouts:
        lines.append(f"💪 Entrenamientos: *{total_workouts}*")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
