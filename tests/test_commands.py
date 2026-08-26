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


def make_context(args):
    ctx = MagicMock()
    ctx.args = args
    return ctx

@pytest.mark.asyncio
async def test_hoy_command_shows_summary():
    from bot.commands import hoy_command
    update = make_update(telegram_id=123456, text="/hoy")
    user = {"id": "uuid"}
    snap = [{"date": "2026-08-26", "steps": 8000, "resting_hr": 50, "sleep_hours": 7.2, "calories_in": 1900}]
    with patch("bot.commands.get_user_by_telegram_id", return_value=user), \
         patch("bot.commands.get_snapshots_range", return_value=snap), \
         patch("bot.commands.get_workouts_range", return_value=[]):
        await hoy_command(update, context)
    text = update.message.reply_text.call_args[0][0]
    assert "Resumen" in text and "8,000" in text

@pytest.mark.asyncio
async def test_entrenos_command_lists_workouts():
    from bot.commands import entrenos_command
    update = make_update(telegram_id=123456, text="/entrenos")
    user = {"id": "uuid"}
    wk = [{"date": "2026-08-24", "title": "Leg Day", "duration_min": 48, "source": "com.hevy"}]
    with patch("bot.commands.get_user_by_telegram_id", return_value=user), \
         patch("bot.commands.get_recent_workouts", return_value=wk):
        await entrenos_command(update, context)
    text = update.message.reply_text.call_args[0][0]
    assert "Leg Day" in text and "Hevy" in text

@pytest.mark.asyncio
async def test_grafico_command_sends_photo():
    from bot.commands import grafico_command
    update = make_update(telegram_id=123456, text="/grafico peso")
    update.message.reply_photo = AsyncMock()
    user = {"id": "uuid"}
    with patch("bot.commands.get_user_by_telegram_id", return_value=user), \
         patch("bot.commands.get_snapshots_range", return_value=[{"date": "2026-08-24", "weight_kg": 82.0}]), \
         patch("bot.commands.build_chart", return_value=(b"\x89PNG-data", "Peso (kg)")):
        await grafico_command(update, make_context(["peso"]))
    update.message.reply_photo.assert_called_once()
    assert "Peso" in update.message.reply_photo.call_args[1]["caption"]

@pytest.mark.asyncio
async def test_grafico_command_unknown_variable():
    from bot.commands import grafico_command
    update = make_update(telegram_id=123456, text="/grafico xyz")
    user = {"id": "uuid"}
    with patch("bot.commands.get_user_by_telegram_id", return_value=user), \
         patch("bot.commands.get_snapshots_range", return_value=[]), \
         patch("bot.commands.build_chart", return_value=(None, None)):
        await grafico_command(update, make_context(["xyz"]))
    text = update.message.reply_text.call_args[0][0]
    assert "No conozco" in text
