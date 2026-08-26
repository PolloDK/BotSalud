# tests/test_handlers.py
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import date, timedelta

def make_update(telegram_id: int, text: str):
    update = MagicMock()
    update.effective_user.id = telegram_id
    update.effective_chat.id = telegram_id
    update.message.text = text
    update.message.reply_text = AsyncMock()
    return update

context = MagicMock()

@pytest.mark.asyncio
async def test_free_text_question_gets_ai_response():
    from bot.handlers import message_handler
    update = make_update(telegram_id=123456, text="¿Cuántas calorías comí ayer?")
    mock_user = {"id": "uuid", "telegram_id": 123456,
                 "objective_text": "75kg dic", "objective_target_weight": 75.0}
    mock_snapshots = [{"date": str(date.today()), "weight_kg": 80.0, "calories_in": 2100}]
    mock_history = []
    with patch("bot.handlers.get_user_by_telegram_id", return_value=mock_user), \
         patch("bot.handlers.get_snapshots_range", return_value=mock_snapshots), \
         patch("bot.handlers.get_workouts_range", return_value=[]), \
         patch("bot.handlers.get_recent_messages", return_value=mock_history), \
         patch("bot.handlers.answer_question", return_value="Comiste 2100 kcal ayer."), \
         patch("bot.handlers.save_message") as mock_save:
        await message_handler(update, context)
    update.message.reply_text.assert_called_once_with("Comiste 2100 kcal ayer.", parse_mode="Markdown")
    assert mock_save.call_count == 2
