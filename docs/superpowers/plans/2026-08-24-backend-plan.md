# BotSalud Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI backend, Supabase schema, Telegram bot, and OpenAI integration that power BotSalud — weekly health reports and natural-language Q&A against the user's health data.

**Architecture:** FastAPI app on Railway receives daily health syncs from the Android app and Telegram webhook events. Supabase stores health snapshots and conversation history. APScheduler triggers a weekly report on Sundays at 8am via OpenAI → Telegram.

**Tech Stack:** Python 3.11, FastAPI, Supabase (supabase-py), OpenAI SDK, python-telegram-bot v21, APScheduler, pytest, Railway, Docker.

---

## File Structure

```
BotSalud/
├── backend/
│   ├── main.py                      # FastAPI app, startup, router registration
│   ├── config.py                    # Pydantic Settings (env vars)
│   ├── database.py                  # Supabase client singleton
│   ├── models.py                    # Pydantic request/response models
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── sync.py                  # POST /sync — receives Android health data
│   │   └── telegram_webhook.py      # POST /telegram/webhook — receives Telegram updates
│   ├── services/
│   │   ├── __init__.py
│   │   ├── health_data.py           # CRUD for health_snapshots and users
│   │   ├── ai_service.py            # OpenAI calls (report + Q&A)
│   │   ├── report_service.py        # Builds weekly report from data + AI
│   │   └── telegram_service.py      # Telegram API wrapper (send messages)
│   ├── bot/
│   │   ├── __init__.py
│   │   ├── commands.py              # /start /objetivo /reporte /semana handlers
│   │   └── handlers.py              # Free-text Q&A handler
│   ├── cron.py                      # APScheduler job — Sunday 8am report
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── tests/
│   ├── conftest.py
│   ├── test_sync.py
│   ├── test_health_data.py
│   ├── test_ai_service.py
│   ├── test_report_service.py
│   └── test_commands.py
├── .gitignore
└── railway.json
```

---

## Task 1: Project Bootstrap

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `.gitignore`
- Create: `railway.json`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
supabase==2.7.4
openai==1.51.0
python-telegram-bot==21.6
apscheduler==3.10.4
pydantic-settings==2.5.2
python-dotenv==1.0.1
httpx==0.27.2
pytest==8.3.3
pytest-asyncio==0.24.0
pytest-mock==3.14.0
```

- [ ] **Step 2: Create .env.example**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=123456:ABC-...
TELEGRAM_WEBHOOK_SECRET=random-secret-string
SYNC_API_SECRET=random-secret-for-android-app
```

- [ ] **Step 3: Create .gitignore**

```
.env
__pycache__/
*.pyc
.pytest_cache/
.venv/
dist/
*.egg-info/
.superpowers/
```

- [ ] **Step 4: Create railway.json**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "backend/Dockerfile"
  },
  "deploy": {
    "startCommand": "uvicorn main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 5: Create backend/Dockerfile**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/.env.example backend/Dockerfile .gitignore railway.json
git commit -m "feat: project bootstrap"
```

---

## Task 2: Supabase Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write the SQL migration**

```sql
-- supabase/migrations/001_initial_schema.sql

create extension if not exists "pgcrypto";

create table if not exists users (
  id                       uuid primary key default gen_random_uuid(),
  telegram_id              bigint unique not null,
  auth_token               text unique not null default encode(gen_random_bytes(32), 'hex'),
  objective_text           text,
  objective_target_weight  numeric(5,2),
  objective_target_date    date,
  created_at               timestamptz not null default now()
);

create table if not exists health_snapshots (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  date             date not null,
  weight_kg        numeric(5,2),
  body_fat_pct     numeric(5,2),
  lean_mass_kg     numeric(5,2),
  bone_mass_kg     numeric(5,2),
  water_pct        numeric(5,2),
  steps            integer,
  active_cal       integer,
  total_cal        integer,
  resting_hr       integer,
  sleep_hours      numeric(4,2),
  sleep_deep_h     numeric(4,2),
  sleep_rem_h      numeric(4,2),
  workout_count    integer,
  workout_minutes  integer,
  calories_in      integer,
  protein_g        numeric(6,2),
  carbs_g          numeric(6,2),
  fat_g            numeric(6,2),
  raw_json         jsonb,
  created_at       timestamptz not null default now(),
  unique(user_id, date)
);

create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_health_snapshots_user_date on health_snapshots(user_id, date desc);
create index if not exists idx_messages_user_created on messages(user_id, created_at desc);
```

- [ ] **Step 2: Apply migration in Supabase dashboard**

Go to Supabase → SQL Editor → paste the migration → Run. Verify three tables appear in Table Editor: `users`, `health_snapshots`, `messages`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: initial supabase schema"
```

---

## Task 3: Config and Database Client

**Files:**
- Create: `backend/config.py`
- Create: `backend/database.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Write failing test for config**

```python
# tests/conftest.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pip install -r requirements.txt
cd .. && pytest tests/conftest.py::test_settings_loads -v
```
Expected: `ModuleNotFoundError: No module named 'config'`

- [ ] **Step 3: Implement config.py**

```python
# backend/config.py
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
```

- [ ] **Step 4: Implement database.py**

```python
# backend/database.py
from supabase import create_client, Client
from config import settings

_client: Client | None = None

def get_db() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pytest tests/conftest.py::test_settings_loads -v
```
Expected: `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/config.py backend/database.py tests/conftest.py
git commit -m "feat: config and supabase client"
```

---

## Task 4: Pydantic Models

**Files:**
- Create: `backend/models.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_models.py (add to conftest imports)
from models import HealthSyncPayload, HealthSnapshot

def test_health_sync_payload_parses():
    payload = HealthSyncPayload(
        date="2026-08-24",
        weight_kg=80.5,
        body_fat_pct=22.1,
        steps=8000,
        calories_in=2100,
        protein_g=150.0,
        carbs_g=200.0,
        fat_g=70.0,
    )
    assert payload.weight_kg == 80.5
    assert payload.date.isoformat() == "2026-08-24"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_models.py -v
```
Expected: `ModuleNotFoundError: No module named 'models'`

- [ ] **Step 3: Implement models.py**

```python
# backend/models.py
from datetime import date
from pydantic import BaseModel

class HealthSyncPayload(BaseModel):
    date: date
    weight_kg: float | None = None
    body_fat_pct: float | None = None
    lean_mass_kg: float | None = None
    bone_mass_kg: float | None = None
    water_pct: float | None = None
    steps: int | None = None
    active_cal: int | None = None
    total_cal: int | None = None
    resting_hr: int | None = None
    sleep_hours: float | None = None
    sleep_deep_h: float | None = None
    sleep_rem_h: float | None = None
    workout_count: int | None = None
    workout_minutes: int | None = None
    calories_in: int | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    raw_json: dict | None = None

class HealthSnapshot(HealthSyncPayload):
    id: str
    user_id: str

class ObjectiveUpdate(BaseModel):
    objective_text: str
    target_weight: float | None = None
    target_date: date | None = None

class TelegramUpdate(BaseModel):
    update_id: int
    message: dict | None = None
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_models.py -v
```
Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/models.py tests/test_models.py
git commit -m "feat: pydantic models"
```

---

## Task 5: Health Data Service

**Files:**
- Create: `backend/services/health_data.py`
- Create: `tests/test_health_data.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_health_data.py
import pytest
from unittest.mock import MagicMock, patch
from datetime import date
from models import HealthSyncPayload

@pytest.fixture
def mock_db():
    db = MagicMock()
    db.table.return_value.upsert.return_value.execute.return_value.data = [{"id": "uuid-1"}]
    db.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "id": "user-uuid", "telegram_id": 123456, "auth_token": "token-abc"
    }
    return db

def test_upsert_snapshot(mock_db):
    from services.health_data import upsert_snapshot
    payload = HealthSyncPayload(date=date(2026, 8, 24), weight_kg=80.5, steps=8000)
    with patch("services.health_data.get_db", return_value=mock_db):
        result = upsert_snapshot("user-uuid", payload)
    assert result == [{"id": "uuid-1"}]
    mock_db.table.assert_called_with("health_snapshots")

def test_get_user_by_token(mock_db):
    from services.health_data import get_user_by_token
    with patch("services.health_data.get_db", return_value=mock_db):
        user = get_user_by_token("token-abc")
    assert user["telegram_id"] == 123456

def test_get_snapshots_range(mock_db):
    from services.health_data import get_snapshots_range
    mock_db.table.return_value.select.return_value.eq.return_value.gte.return_value.lte.return_value.order.return_value.execute.return_value.data = []
    with patch("services.health_data.get_db", return_value=mock_db):
        result = get_snapshots_range("user-uuid", date(2026, 8, 17), date(2026, 8, 24))
    assert result == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_health_data.py -v
```
Expected: `ModuleNotFoundError: No module named 'services.health_data'`

- [ ] **Step 3: Create services/__init__.py**

```bash
touch backend/services/__init__.py
```

- [ ] **Step 4: Implement services/health_data.py**

```python
# backend/services/health_data.py
from datetime import date
from database import get_db
from models import HealthSyncPayload

def upsert_snapshot(user_id: str, payload: HealthSyncPayload) -> list:
    data = payload.model_dump(exclude_none=True)
    data["user_id"] = user_id
    data["date"] = str(data["date"])
    return get_db().table("health_snapshots").upsert(data, on_conflict="user_id,date").execute().data

def get_user_by_token(token: str) -> dict | None:
    return get_db().table("users").select("*").eq("auth_token", token).single().execute().data

def get_user_by_telegram_id(telegram_id: int) -> dict | None:
    result = get_db().table("users").select("*").eq("telegram_id", telegram_id).execute()
    return result.data[0] if result.data else None

def create_user(telegram_id: int) -> dict:
    return get_db().table("users").insert({"telegram_id": telegram_id}).execute().data[0]

def update_objective(user_id: str, objective_text: str, target_weight: float | None, target_date: date | None) -> dict:
    data = {"objective_text": objective_text}
    if target_weight:
        data["objective_target_weight"] = target_weight
    if target_date:
        data["objective_target_date"] = str(target_date)
    return get_db().table("users").update(data).eq("id", user_id).execute().data[0]

def get_snapshots_range(user_id: str, start: date, end: date) -> list:
    return (
        get_db().table("health_snapshots")
        .select("*")
        .eq("user_id", user_id)
        .gte("date", str(start))
        .lte("date", str(end))
        .order("date", desc=False)
        .execute()
        .data
    )

def save_message(user_id: str, role: str, content: str) -> None:
    get_db().table("messages").insert({"user_id": user_id, "role": role, "content": content}).execute()

def get_recent_messages(user_id: str, limit: int = 10) -> list:
    return (
        get_db().table("messages")
        .select("role,content")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data[::-1]
    )
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_health_data.py -v
```
Expected: all 3 `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/services/__init__.py backend/services/health_data.py tests/test_health_data.py
git commit -m "feat: health data service"
```

---

## Task 6: Sync Endpoint

**Files:**
- Create: `backend/routers/__init__.py`
- Create: `backend/routers/sync.py`
- Create: `tests/test_sync.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_sync.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

@pytest.fixture
def client():
    from main import app
    return TestClient(app)

def test_sync_missing_auth_returns_401(client):
    response = client.post("/sync", json={"date": "2026-08-24"})
    assert response.status_code == 401

def test_sync_invalid_token_returns_401(client):
    with patch("routers.sync.get_user_by_token", return_value=None):
        response = client.post(
            "/sync",
            json={"date": "2026-08-24", "weight_kg": 80.5},
            headers={"Authorization": "Bearer bad-token"}
        )
    assert response.status_code == 401

def test_sync_valid_request_returns_200(client):
    mock_user = {"id": "user-uuid", "telegram_id": 123}
    with patch("routers.sync.get_user_by_token", return_value=mock_user), \
         patch("routers.sync.upsert_snapshot", return_value=[{"id": "snap-uuid"}]):
        response = client.post(
            "/sync",
            json={"date": "2026-08-24", "weight_kg": 80.5, "steps": 8000},
            headers={"Authorization": "Bearer valid-token"}
        )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_sync.py -v
```
Expected: `ModuleNotFoundError: No module named 'main'`

- [ ] **Step 3: Create routers/__init__.py**

```bash
touch backend/routers/__init__.py
```

- [ ] **Step 4: Implement routers/sync.py**

```python
# backend/routers/sync.py
from fastapi import APIRouter, HTTPException, Header
from models import HealthSyncPayload
from services.health_data import get_user_by_token, upsert_snapshot

router = APIRouter()

@router.post("/sync")
async def sync_health_data(
    payload: HealthSyncPayload,
    authorization: str | None = Header(default=None)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = authorization.removeprefix("Bearer ")
    user = get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    upsert_snapshot(user["id"], payload)
    return {"status": "ok"}
```

- [ ] **Step 5: Create minimal main.py to make tests runnable**

```python
# backend/main.py
from fastapi import FastAPI
from routers.sync import router as sync_router

app = FastAPI(title="BotSalud")
app.include_router(sync_router)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && pytest ../tests/test_sync.py -v
```
Expected: all 3 `PASSED`

- [ ] **Step 7: Commit**

```bash
git add backend/routers/__init__.py backend/routers/sync.py backend/main.py tests/test_sync.py
git commit -m "feat: sync endpoint"
```

---

## Task 7: Telegram Service

**Files:**
- Create: `backend/services/telegram_service.py`

- [ ] **Step 1: Write failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_telegram_service.py -v
```
Expected: `ModuleNotFoundError: No module named 'services.telegram_service'`

- [ ] **Step 3: Implement services/telegram_service.py**

```python
# backend/services/telegram_service.py
from telegram import Bot
from config import settings

bot = Bot(token=settings.telegram_bot_token)

async def send_message(chat_id: int, text: str) -> None:
    await bot.send_message(chat_id=chat_id, text=text, parse_mode="Markdown")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_telegram_service.py -v
```
Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/services/telegram_service.py tests/test_telegram_service.py
git commit -m "feat: telegram service"
```

---

## Task 8: AI Service

**Files:**
- Create: `backend/services/ai_service.py`
- Create: `tests/test_ai_service.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_ai_service.py
import pytest
from unittest.mock import patch, MagicMock

def make_mock_openai_response(text: str):
    mock = MagicMock()
    mock.choices[0].message.content = text
    return mock

def test_answer_question():
    from services.ai_service import answer_question
    snapshots = [{"date": "2026-08-24", "weight_kg": 80.5, "calories_in": 2100}]
    history = [{"role": "user", "content": "hola"}]
    with patch("services.ai_service.client") as mock_client:
        mock_client.chat.completions.create.return_value = make_mock_openai_response("Comiste 2100 kcal ayer.")
        result = answer_question(
            question="¿Cuánto comí ayer?",
            snapshots=snapshots,
            history=history,
            objective="Llegar a 75kg en diciembre 2026"
        )
    assert "2100" in result

def test_generate_report():
    from services.ai_service import generate_report
    snapshots = [{"date": "2026-08-24", "weight_kg": 80.5}]
    with patch("services.ai_service.client") as mock_client:
        mock_client.chat.completions.create.return_value = make_mock_openai_response("📊 Tu reporte...")
        result = generate_report(
            snapshots=snapshots,
            objective="Llegar a 75kg en diciembre 2026",
            target_weight=75.0,
            target_date="2026-12-31"
        )
    assert "reporte" in result.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_ai_service.py -v
```
Expected: `ModuleNotFoundError: No module named 'services.ai_service'`

- [ ] **Step 3: Implement services/ai_service.py**

```python
# backend/services/ai_service.py
import json
from openai import OpenAI
from config import settings

client = OpenAI(api_key=settings.openai_api_key)

SYSTEM_PROMPT = """Eres un asistente de salud personal experto en nutrición, entrenamiento y composición corporal.
Tu usuario está en proceso de recomposición corporal. Responde siempre en español, de forma concisa y práctica.
Usa los datos de salud del usuario para dar respuestas precisas y personalizadas.
No inventes datos — si no tienes la información, dilo."""

def answer_question(question: str, snapshots: list, history: list, objective: str) -> str:
    data_summary = json.dumps(snapshots[-7:], ensure_ascii=False, default=str)
    messages = [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nObjetivo del usuario: {objective}\n\nDatos recientes (últimos 7 días):\n{data_summary}"},
        *history,
        {"role": "user", "content": question}
    ]
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=500,
        temperature=0.7
    )
    return response.choices[0].message.content

def generate_report(snapshots: list, objective: str, target_weight: float | None, target_date: str | None) -> str:
    data_summary = json.dumps(snapshots, ensure_ascii=False, default=str)
    prompt = f"""Genera un reporte semanal de salud completo y motivador para el usuario.

Objetivo: {objective}
Peso objetivo: {target_weight} kg para {target_date}

Datos de la semana:
{data_summary}

El reporte debe incluir (en este orden):
1. 📊 Progreso de peso y composición corporal (vs objetivo y vs semana anterior)
2. 💪 Resumen de entrenamiento (sesiones, volumen, consistencia)
3. 🥗 Nutrición (calorías y macros promedio, días dentro del objetivo, déficit acumulado)
4. 🚶 Actividad general (pasos, sueño, minutos activos)
5. 🎯 Proyección: a este ritmo, ¿llegas al objetivo en la fecha?
6. ✅ 3 recomendaciones concretas para la próxima semana

Usa emojis, sé directo y motivador. Si faltan datos de alguna sección, omítela con gracia."""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        max_tokens=1200,
        temperature=0.7
    )
    return response.choices[0].message.content
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_ai_service.py -v
```
Expected: all 2 `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai_service.py tests/test_ai_service.py
git commit -m "feat: ai service (openai)"
```

---

## Task 9: Weekly Report Service

**Files:**
- Create: `backend/services/report_service.py`
- Create: `tests/test_report_service.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_report_service.py
import pytest
from unittest.mock import patch
from datetime import date

def test_generate_weekly_report_for_all_users():
    from services.report_service import generate_and_send_weekly_reports
    mock_users = [
        {"id": "user-1", "telegram_id": 111, "objective_text": "75kg diciembre",
         "objective_target_weight": 75.0, "objective_target_date": "2026-12-31"}
    ]
    mock_snapshots = [{"date": "2026-08-24", "weight_kg": 80.5, "steps": 8000}]
    with patch("services.report_service.get_db") as mock_db, \
         patch("services.report_service.get_snapshots_range", return_value=mock_snapshots), \
         patch("services.report_service.generate_report", return_value="📊 Reporte..."), \
         patch("services.report_service.send_message") as mock_send:
        mock_db.return_value.table.return_value.select.return_value.execute.return_value.data = mock_users
        import asyncio
        asyncio.run(generate_and_send_weekly_reports())
        mock_send.assert_called_once()
        args = mock_send.call_args
        assert args.kwargs["chat_id"] == 111
        assert "Reporte" in args.kwargs["text"]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_report_service.py -v
```
Expected: `ModuleNotFoundError: No module named 'services.report_service'`

- [ ] **Step 3: Implement services/report_service.py**

```python
# backend/services/report_service.py
from datetime import date, timedelta
from database import get_db
from services.health_data import get_snapshots_range
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
        report_text = generate_report(
            snapshots=snapshots,
            objective=user.get("objective_text", "Mejorar salud general"),
            target_weight=user.get("objective_target_weight"),
            target_date=str(user.get("objective_target_date", ""))
        )
        header = f"*📋 Reporte semanal — {end.strftime('%d %b %Y')}*\n\n"
        await send_message(chat_id=user["telegram_id"], text=header + report_text)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_report_service.py -v
```
Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/services/report_service.py tests/test_report_service.py
git commit -m "feat: weekly report service"
```

---

## Task 10: Cron Job

**Files:**
- Create: `backend/cron.py`

- [ ] **Step 1: Implement cron.py**

```python
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
```

- [ ] **Step 2: Wire scheduler into main.py**

```python
# backend/main.py  (full file)
from contextlib import asynccontextmanager
from fastapi import FastAPI
from routers.sync import router as sync_router
from cron import setup_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = setup_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(title="BotSalud", lifespan=lifespan)
app.include_router(sync_router)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Commit**

```bash
git add backend/cron.py backend/main.py
git commit -m "feat: weekly cron job (sundays 8am santiago)"
```

---

## Task 11: Telegram Bot Commands

**Files:**
- Create: `backend/bot/__init__.py`
- Create: `backend/bot/commands.py`
- Create: `tests/test_commands.py`

- [ ] **Step 1: Write failing tests**

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_commands.py -v
```
Expected: `ModuleNotFoundError: No module named 'bot.commands'`

- [ ] **Step 3: Create bot/__init__.py**

```bash
touch backend/bot/__init__.py
```

- [ ] **Step 4: Implement bot/commands.py**

```python
# backend/bot/commands.py
from telegram import Update
from telegram.ext import ContextTypes
from services.health_data import (
    get_user_by_telegram_id, create_user, update_objective, get_snapshots_range
)
from services.report_service import generate_and_send_weekly_reports
from services.ai_service import generate_report
from datetime import date, timedelta
import re

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        user = create_user(telegram_id)
        msg = (
            f"👋 ¡Bienvenido a BotSalud!\n\n"
            f"Tu token de sincronización es:\n`{user['auth_token']}`\n\n"
            f"Cópialo en la app Android para activar la sincronización automática.\n\n"
            f"Usa /objetivo para configurar tu meta de salud."
        )
    else:
        msg = (
            f"👋 ¡Hola de nuevo!\n\n"
            f"Tu token de sincronización:\n`{user['auth_token']}`\n\n"
            f"Usa /objetivo para ver o actualizar tu meta."
        )
    await update.message.reply_text(msg, parse_mode="Markdown")

async def objetivo_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    args_text = " ".join(context.args) if context.args else ""
    if not args_text:
        current = user.get("objective_text", "Sin objetivo configurado")
        await update.message.reply_text(
            f"🎯 *Tu objetivo actual:*\n{current}\n\n"
            f"Para actualizarlo: `/objetivo llegar a 73kg en enero 2027`",
            parse_mode="Markdown"
        )
        return
    weight_match = re.search(r"(\d+(?:\.\d+)?)\s*kg", args_text)
    target_weight = float(weight_match.group(1)) if weight_match else None
    update_objective(
        user_id=user["id"],
        objective_text=args_text,
        target_weight=target_weight,
        target_date=None
    )
    await update.message.reply_text(f"✅ Objetivo actualizado: _{args_text}_", parse_mode="Markdown")

async def reporte_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    await update.message.reply_text("⏳ Generando tu reporte...")
    end = date.today()
    start = end - timedelta(days=7)
    snapshots = get_snapshots_range(user["id"], start, end)
    if not snapshots:
        await update.message.reply_text("No tengo datos de esta semana aún. Asegúrate de que la app Android esté sincronizando.")
        return
    report_text = generate_report(
        snapshots=snapshots,
        objective=user.get("objective_text", "Mejorar salud general"),
        target_weight=user.get("objective_target_weight"),
        target_date=str(user.get("objective_target_date", ""))
    )
    header = f"*📋 Reporte — {end.strftime('%d %b %Y')}*\n\n"
    await update.message.reply_text(header + report_text, parse_mode="Markdown")

async def semana_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start primero.")
        return
    end = date.today()
    start = end - timedelta(days=7)
    snapshots = get_snapshots_range(user["id"], start, end)
    if not snapshots:
        await update.message.reply_text("Sin datos esta semana.")
        return
    latest = snapshots[-1]
    lines = [f"*📊 Resumen de la semana ({len(snapshots)} días de datos)*\n"]
    if latest.get("weight_kg"):
        lines.append(f"⚖️ Peso más reciente: *{latest['weight_kg']} kg*")
    if latest.get("body_fat_pct"):
        lines.append(f"📉 Grasa corporal: *{latest['body_fat_pct']}%*")
    avg_steps = sum(s.get("steps") or 0 for s in snapshots) // len(snapshots)
    if avg_steps:
        lines.append(f"🚶 Pasos promedio: *{avg_steps:,}*")
    avg_cal = sum(s.get("calories_in") or 0 for s in snapshots) // len(snapshots)
    if avg_cal:
        lines.append(f"🥗 Calorías promedio: *{avg_cal} kcal*")
    total_workouts = sum(s.get("workout_count") or 0 for s in snapshots)
    if total_workouts:
        lines.append(f"💪 Entrenamientos: *{total_workouts}*")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_commands.py -v
```
Expected: all 2 `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/bot/__init__.py backend/bot/commands.py tests/test_commands.py
git commit -m "feat: telegram bot commands"
```

---

## Task 12: Q&A Handler (Free Text)

**Files:**
- Create: `backend/bot/handlers.py`

- [ ] **Step 1: Write failing test**

```python
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
         patch("bot.handlers.get_recent_messages", return_value=mock_history), \
         patch("bot.handlers.answer_question", return_value="Comiste 2100 kcal ayer."), \
         patch("bot.handlers.save_message") as mock_save:
        await message_handler(update, context)
    update.message.reply_text.assert_called_once_with("Comiste 2100 kcal ayer.", parse_mode="Markdown")
    assert mock_save.call_count == 2
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_handlers.py -v
```
Expected: `ModuleNotFoundError: No module named 'bot.handlers'`

- [ ] **Step 3: Implement bot/handlers.py**

```python
# backend/bot/handlers.py
from datetime import date, timedelta
from telegram import Update
from telegram.ext import ContextTypes
from services.health_data import (
    get_user_by_telegram_id, get_snapshots_range, get_recent_messages, save_message
)
from services.ai_service import answer_question

async def message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    telegram_id = update.effective_user.id
    user = get_user_by_telegram_id(telegram_id)
    if not user:
        await update.message.reply_text("Usa /start para comenzar.")
        return
    question = update.message.text
    end = date.today()
    start = end - timedelta(days=30)
    snapshots = get_snapshots_range(user["id"], start, end)
    history = get_recent_messages(user["id"], limit=10)
    answer = answer_question(
        question=question,
        snapshots=snapshots,
        history=history,
        objective=user.get("objective_text", "")
    )
    save_message(user["id"], "user", question)
    save_message(user["id"], "assistant", answer)
    await update.message.reply_text(answer, parse_mode="Markdown")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_handlers.py -v
```
Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/bot/handlers.py tests/test_handlers.py
git commit -m "feat: free-text Q&A handler"
```

---

## Task 13: Telegram Webhook Router

**Files:**
- Create: `backend/routers/telegram_webhook.py`

- [ ] **Step 1: Implement routers/telegram_webhook.py**

```python
# backend/routers/telegram_webhook.py
from fastapi import APIRouter, Request, HTTPException, Header
from telegram import Update, Bot
from telegram.ext import Application, CommandHandler, MessageHandler, filters
from config import settings
from bot.commands import start_command, objetivo_command, reporte_command, semana_command
from bot.handlers import message_handler

router = APIRouter()

def build_application() -> Application:
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("objetivo", objetivo_command))
    app.add_handler(CommandHandler("reporte", reporte_command))
    app.add_handler(CommandHandler("semana", semana_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, message_handler))
    return app

telegram_app = build_application()

@router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None)
):
    if x_telegram_bot_api_secret_token != settings.telegram_webhook_secret:
        raise HTTPException(status_code=403, detail="Invalid secret")
    data = await request.json()
    update = Update.de_json(data, telegram_app.bot)
    await telegram_app.initialize()
    await telegram_app.process_update(update)
    return {"ok": True}
```

- [ ] **Step 2: Wire into main.py**

```python
# backend/main.py  (full file)
from contextlib import asynccontextmanager
from fastapi import FastAPI
from routers.sync import router as sync_router
from routers.telegram_webhook import router as telegram_router
from cron import setup_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = setup_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(title="BotSalud", lifespan=lifespan)
app.include_router(sync_router)
app.include_router(telegram_router)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 3: Commit**

```bash
git add backend/routers/telegram_webhook.py backend/main.py
git commit -m "feat: telegram webhook router"
```

---

## Task 14: Deploy to Railway

**Files:**
- Modify: `.env` (create from `.env.example`)

- [ ] **Step 1: Create Telegram bot**

Open Telegram → search @BotFather → `/newbot` → follow steps → copy the bot token.

- [ ] **Step 2: Create Supabase project**

Go to supabase.com → New project → copy `Project URL` and `service_role` key from Settings → API.
Apply migration from Task 2 via SQL Editor.

- [ ] **Step 3: Deploy to Railway**

```bash
# Install Railway CLI if needed
npm install -g @railway/cli
railway login
railway init   # select "Empty project"
railway up
```

Railway auto-detects `railway.json` and builds with Dockerfile.

- [ ] **Step 4: Set environment variables in Railway**

In Railway dashboard → your service → Variables, add:
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
OPENAI_API_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=any-random-string-you-choose
SYNC_API_SECRET=any-random-string-you-choose
```

- [ ] **Step 5: Get Railway public URL**

Railway dashboard → your service → Settings → Generate Domain. Copy the URL (e.g. `https://botsalud-production.up.railway.app`).

- [ ] **Step 6: Register Telegram webhook**

```bash
# Replace values below with your actual token, URL, and secret
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://botsalud-production.up.railway.app/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```
Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

- [ ] **Step 7: Smoke test**

Open Telegram → find your bot → send `/start`.
Expected: bot replies with welcome message and your auth token.

Send a question: "¿Cómo estoy yendo hacia mi objetivo?"
Expected: bot replies (may say no data yet, that's correct).

- [ ] **Step 8: Commit**

```bash
git add railway.json
git commit -m "chore: railway deployment config"
git push origin master
```

---

## Task 15: Run Full Test Suite

- [ ] **Step 1: Run all tests**

```bash
cd backend
pytest ../tests/ -v --tb=short
```
Expected: all tests `PASSED`, no failures.

- [ ] **Step 2: Final commit**

```bash
git add .
git commit -m "test: full test suite passing"
git push origin master
```

---

## Summary

After completing this plan:
- FastAPI backend running on Railway, auto-restarting on failure
- Supabase schema with users, health_snapshots, messages
- Telegram bot responding to /start, /objetivo, /reporte, /semana and free-text questions
- Weekly report auto-sent every Sunday at 8am (Santiago timezone)
- Ready to receive health data syncs from the Android app (Plan 2)
