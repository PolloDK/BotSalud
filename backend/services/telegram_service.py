# backend/services/telegram_service.py
from telegram import Bot
from config import settings

bot = Bot(token=settings.telegram_bot_token)


async def send_message(chat_id: int, text: str) -> None:
    await bot.send_message(chat_id=chat_id, text=text, parse_mode="Markdown")
