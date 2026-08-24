# backend/cron.py
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from services.report_service import generate_and_send_weekly_reports

def setup_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        generate_and_send_weekly_reports,
        trigger=CronTrigger(day_of_week="sun", hour=8, minute=0, timezone="America/Santiago"),
        id="weekly_report",
        replace_existing=True
    )
    return scheduler
