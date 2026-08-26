# backend/services/telegram_service.py
import re
from telegram import Bot
from config import settings

bot = Bot(token=settings.telegram_bot_token)


def to_telegram_markdown(text: str) -> str:
    """Convert generic Markdown from the LLM into Telegram legacy-Markdown.

    Telegram's Markdown does NOT support headings (#, ##, ###) or double-asterisk
    bold (**). The model tends to emit those, so they show up as literal noise.
    We normalise them: headings and **bold** become single-asterisk *bold*.
    Code blocks (``` ```), used for aligned tables, are left untouched.
    """
    if not text:
        return text
    # Protect fenced code blocks from transformation.
    blocks: list[str] = []

    def _stash(m: re.Match) -> str:
        blocks.append(m.group(0))
        return f"\x00{len(blocks) - 1}\x00"

    text = re.sub(r"```.*?```", _stash, text, flags=re.DOTALL)

    # **bold** / __bold__ -> *bold*
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text)
    text = re.sub(r"__(.+?)__", r"*\1*", text)
    # Markdown headings at line start -> bold line
    text = re.sub(r"(?m)^\s{0,3}#{1,6}\s*(.+?)\s*$", r"*\1*", text)
    # Normalise bullet markers "- " / "* " -> "• "
    text = re.sub(r"(?m)^\s{0,3}[-*]\s+", "• ", text)

    # Restore code blocks.
    text = re.sub(r"\x00(\d+)\x00", lambda m: blocks[int(m.group(1))], text)
    return text


async def send_message(chat_id: int, text: str) -> None:
    formatted = to_telegram_markdown(text)
    try:
        await bot.send_message(chat_id=chat_id, text=formatted, parse_mode="Markdown")
    except Exception:
        # Fallback: a parse error must never block delivery.
        await bot.send_message(chat_id=chat_id, text=text)
