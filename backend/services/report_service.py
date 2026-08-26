# backend/services/report_service.py
from datetime import date, timedelta
from database import get_db
from services.health_data import get_snapshots_range, get_workouts_range
from services.ai_service import generate_report
from services.telegram_service import send_message


async def generate_and_send_weekly_reports() -> None:
    users = get_db().table("users").select("*").execute().data
    end = date.today()
    start = end - timedelta(days=7)
    for user in users:
        snapshots = get_snapshots_range(user["id"], start, end)
        if not snapshots:
            continue
        workouts = get_workouts_range(user["id"], start, end)
        report_text = generate_report(
            snapshots=snapshots,
            objective=user.get("objective_text", "Mejorar salud general"),
            target_weight=user.get("objective_target_weight"),
            target_date=str(user.get("objective_target_date", "")),
            workouts=workouts
        )
        header = f"*📋 Reporte semanal — {end.strftime('%d %b %Y')}*\n\n"
        await send_message(chat_id=user["telegram_id"], text=header + report_text)
