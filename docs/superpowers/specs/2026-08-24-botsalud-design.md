# BotSalud — Design Spec
**Date:** 2026-08-24
**Status:** Approved

## Overview

Personal health tracking bot that automatically collects data from all health sources via Android Health Connect, stores it in Supabase, and delivers weekly AI-generated progress reports via Telegram. Users can also query their health data in natural language at any time.

Initial deployment: single user (Cristian). Designed for multi-user from the start.

**Current user objective:** Body recomposition — reach 75kg by December 2026.

---

## Architecture

```
Android (Health Connect hub)
  Garmin → Health Connect ←─ App Compañera (React Native APK)
  Fitia  → Health Connect         │ sync every night 2am
  Hevy   → Health Connect         │
  Scale  → Google Fit → HC        ▼
  SmartFit → Health Connect   Railway (FastAPI)
                                  │
                              Supabase (PostgreSQL)
                                  │
                              OpenAI API (GPT-4o-mini / GPT-4o)
                                  │
                           Telegram Bot API
                                  │
                           User's Telegram
```

---

## Components

### 1. Android Companion App (React Native)

- Distributed as APK (no Play Store required for initial single-user phase)
- On install: requests Health Connect permissions once (weight, body composition, nutrition, workouts, sleep, steps, heart rate)
- Background task runs nightly at 2am via Android WorkManager
- Reads previous calendar day's data from Health Connect (not rolling 24h)
- POSTs JSON payload to Railway API with user auth token
- UI: setup/onboarding screen with high-quality design (frontend-design, design-taste, ui-ux-pro-max skills applied during implementation)

**Health Connect data types read:**
- Body: Weight, BodyFat, LeanBodyMass, BoneMass, BodyWaterMass
- Activity: ExerciseSessions, Steps, ActiveCaloriesBurned, TotalCaloriesBurned, Distance
- Nutrition: Nutrition records (calories, protein, carbs, fat)
- Sleep: SleepSession with stages
- Vitals: HeartRate, RestingHeartRate, HrvSdnn

### 2. Backend — Railway (Python + FastAPI)

**Endpoints:**
- `POST /sync` — receives daily health data from Android app (auth: user token)
- `POST /telegram/webhook` — receives Telegram messages
- `GET /health` — healthcheck

**Cron job:** Every Sunday at 8am → generates weekly report → sends via Telegram

**AI flows:**
- Weekly report: GPT-4o with full week data + user objective → structured report
- Q&A: GPT-4o-mini with relevant Supabase data + last 10 messages context → natural language answer

### 3. Database — Supabase (PostgreSQL)

**Tables:**

`users`
```
id              uuid PK
telegram_id     bigint UNIQUE
auth_token      text (used by Android app)
objective_text  text  (e.g. "Llegar a 75kg en diciembre 2026")
objective_target_weight  numeric
objective_target_date    date
created_at      timestamptz
```

`health_snapshots`
```
id              uuid PK
user_id         uuid FK → users
date            date
weight_kg       numeric
body_fat_pct    numeric
lean_mass_kg    numeric
bone_mass_kg    numeric
water_pct       numeric
steps           integer
active_cal      integer
total_cal       integer
resting_hr      integer
sleep_hours     numeric
sleep_deep_h    numeric
sleep_rem_h     numeric
workout_count   integer
workout_minutes integer
calories_in     integer
protein_g       numeric
carbs_g         numeric
fat_g           numeric
raw_json        jsonb  (full payload for future fields)
created_at      timestamptz
```

`messages`
```
id          uuid PK
user_id     uuid FK → users
role        text  (user | assistant)
content     text
created_at  timestamptz
```

### 4. Telegram Bot

**Commands:**
- `/start` — onboarding, links Telegram account, shows setup instructions for Android app
- `/objetivo` — view or update health objective
- `/reporte` — generate and send report immediately (doesn't wait for Sunday)
- `/semana` — quick summary of current week so far
- Free text → Q&A against user's health data

**Weekly report sections (every Sunday 8am):**
1. Progreso de peso y composición (vs objective, vs last week)
2. Resumen de entrenamiento (sessions, volume, PRs)
3. Nutrición (avg daily calories/macros, days on target, caloric deficit)
4. Actividad general (avg steps, sleep, active minutes)
5. Proyección al objetivo (at current pace, will you hit 75kg by December?)
6. Recomendaciones IA (3 concrete actions for next week)

---

## Data Flow

**Nightly sync (2am):**
```
Android app wakes → reads Health Connect (last 24h)
→ POST /sync with auth token + JSON payload
→ Railway validates token → upserts health_snapshots row for today
→ 200 OK → app sleeps
```

**Weekly report (Sunday 8am):**
```
Railway cron triggers
→ queries health_snapshots for last 7 days
→ builds prompt: user objective + 7-day metrics
→ GPT-4o generates report text
→ Telegram sendMessage to user's chat_id
```

**Q&A:**
```
User sends message in Telegram
→ Telegram webhook → POST /telegram/webhook
→ fetch last 30 days of health_snapshots
→ fetch last 10 messages from messages table
→ build prompt: system context + health data + conversation history + user question
→ GPT-4o-mini generates answer
→ Telegram sendMessage reply
→ store user message + assistant reply in messages table
```

**Objective update:**
```
User sends: /objetivo llegar a 73kg en enero
→ GPT-4o-mini extracts target weight + date
→ UPDATE users SET objective_* WHERE id = user_id
→ confirm message
```

---

## Tech Stack

| Layer | Technology | Cost/month |
|---|---|---|
| Backend | Python + FastAPI on Railway Hobby | ~$5 |
| Database | Supabase PostgreSQL (free tier) | $0 |
| AI | OpenAI GPT-4o-mini (Q&A) + GPT-4o (reports) | ~$2–5 |
| Bot | Telegram Bot API | $0 |
| Mobile | React Native APK | $0 |
| **Total** | | **~$7–10** |

---

## Multi-user Design

All tables use `user_id` FK from the start. Each user has their own:
- Telegram chat ID
- Android app auth token
- Health objective
- Health snapshots

To onboard a new user: they install the APK, `/start` in Telegram generates their auth token, they enter it in the app. No admin intervention needed.

---

## Out of Scope (v1)

- Web dashboard
- Historical Smart Fit InBody data (new scans will flow through Health Connect automatically)
- Proactive notifications (e.g. "you haven't trained in 3 days") — can be added later
- iOS support
- Garmin advanced metrics (Body Battery, HRV detail) — Health Connect covers standard metrics
