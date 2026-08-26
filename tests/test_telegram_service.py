# tests/test_telegram_service.py
import pytest
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_send_message():
    from services.telegram_service import send_message
    with patch("services.telegram_service.bot") as mock_bot:
        mock_bot.send_message = AsyncMock(return_value=None)
        await send_message(chat_id=123456, text="Hello!")
        mock_bot.send_message.assert_called_once_with(
            chat_id=123456, text="Hello!", parse_mode="Markdown"
        )


def test_to_telegram_markdown_strips_headings_and_double_bold():
    from services.telegram_service import to_telegram_markdown
    src = "### Resumen\nHiciste **buen** trabajo\n- item uno\n- item dos"
    out = to_telegram_markdown(src)
    assert "###" not in out
    assert "**" not in out
    assert "*Resumen*" in out      # heading -> bold
    assert "*buen*" in out          # ** -> *
    assert "• item uno" in out      # bullet normalised


def test_to_telegram_markdown_preserves_code_blocks():
    from services.telegram_service import to_telegram_markdown
    src = "Tabla:\n```\nDia  Pasos\nLun  8000\n```"
    out = to_telegram_markdown(src)
    assert "```\nDia  Pasos\nLun  8000\n```" in out
