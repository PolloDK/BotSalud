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
