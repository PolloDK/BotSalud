# backend/routers/telegram_webhook.py
from fastapi import APIRouter, Request, HTTPException, Header
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters
from config import settings
from bot.commands import start_command, objetivo_command, reporte_command, semana_command
from bot.handlers import message_handler

router = APIRouter()

def build_application() -> Application:
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("objetivo", objetivo_command))
    app.add_handler(CommandHandler("reporte", reporte_command))
    app.add_handler(CommandHandler("semana", semana_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    return app

telegram_app = build_application()

@router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None)
):
    if x_telegram_bot_api_secret_token != settings.telegram_webhook_secret:
        raise HTTPException(status_code=403, detail="Invalid secret")
    data = await request.json()
    update = Update.de_json(data, telegram_app.bot)
    await telegram_app.initialize()
    await telegram_app.process_update(update)
    return {"ok": True}
