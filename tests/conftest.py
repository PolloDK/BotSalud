import os
import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123:test")
os.environ.setdefault("TELEGRAM_WEBHOOK_SECRET", "webhook-secret")
os.environ.setdefault("SYNC_API_SECRET", "sync-secret")

from config import Settings

def test_settings_loads():
    s = Settings()
    assert s.supabase_url == "https://test.supabase.co"
    assert s.sync_api_secret == "sync-secret"
