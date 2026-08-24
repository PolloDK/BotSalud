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
