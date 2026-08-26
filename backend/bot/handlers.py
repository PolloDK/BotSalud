# backend/bot/handlers.py
from datetime import date, timedelta
from telegram import Update
from telegram.ext import ContextTypes
from services.health_data import (
    get_user_by_telegram_id, get_snapshots_range, get_workouts_range,
    get_recent_messages, save_message
)
from services.ai_service import answer_question
from services.telegram_service import to_telegram_markdown

async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start para comenzar.")
        return
    question = update.message.text
    end = date.today()
    start = end - timedelta(days=30)
    snapshots = get_snapshots_range(user["id"], start, end)
    workouts = get_workouts_range(user["id"], start, end)
    history = get_recent_messages(user["id"], limit=10)
    answer = answer_question(
        question=question,
        snapshots=snapshots,
        workouts=workouts,
        history=history,
        objective=user.get("objective_text", "")
    )
    save_message(user["id"], "user", question)
    save_message(user["id"], "assistant", answer)
    try:
        await update.message.reply_text(to_telegram_markdown(answer), parse_mode="Markdown")
    except Exception:
        # A formatting glitch must never block delivery — resend as plain text.
        await update.message.reply_text(answer)
