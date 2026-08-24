# tests/test_commands.py
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

def make_update(telegram_id: int, text: str):
    update = MagicMock()
    update.effective_user.id = telegram_id
    update.effective_chat.id = telegram_id
    update.message.text = text
    update.message.reply_text = AsyncMock()
    return update

context = MagicMock()

@pytest.mark.asyncio
async def test_start_new_user_creates_account():
    from bot.commands import start_command
    update = make_update(telegram_id=123456, text="/start")
    mock_user = {"id": "uuid", "telegram_id": 123456, "auth_token": "abc123"}
    with patch("bot.commands.get_user_by_telegram_id", return_value=None), \
         patch("bot.commands.create_user", return_value=mock_user):
        await start_command(update, context)
    update.message.reply_text.assert_called_once()
    call_text = update.message.reply_text.call_args[0][0]
    assert "abc123" in call_text

@pytest.mark.asyncio
async def test_start_existing_user_shows_token():
    from bot.commands import start_command
    update = make_update(telegram_id=123456, text="/start")
    mock_user = {"id": "uuid", "telegram_id": 123456, "auth_token": "existing-token"}
    with patch("bot.commands.get_user_by_telegram_id", return_value=mock_user):
        await start_command(update, context)
    call_text = update.message.reply_text.call_args[0][0]
    assert "existing-token" in call_text
