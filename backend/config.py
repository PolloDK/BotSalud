from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_key: str
    openai_api_key: str
    telegram_bot_token: str
    telegram_webhook_secret: str
    sync_api_secret: str

settings = Settings()
