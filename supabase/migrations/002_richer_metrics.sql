-- supabase/migrations/002_richer_metrics.sql

alter table health_snapshots
  add column if not exists hr_avg       integer,
  add column if not exists hr_min       integer,
  add column if not exists hr_max       integer,
  add column if not exists sleep_light_h numeric(4,2),
  add column if not exists distance_km  numeric(6,2),
  add column if not exists floors       integer,
  add column if not exists elevation_m  numeric(7,2),
  add column if not exists fiber_g      numeric(6,2),
  add column if not exists sugar_g      numeric(6,2),
  add column if not exists sodium_mg    numeric(7,1),
  add column if not exists sat_fat_g    numeric(6,2);

create table if not exists workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  hc_uuid       text not null,
  date          date not null,
  start_time    timestamptz,
  end_time      timestamptz,
  source        text,
  exercise_type integer,
  title         text,
  duration_min  integer,
  detail        text,
  created_at    timestamptz not null default now(),
  unique(user_id, hc_uuid)
);
create index if not exists idx_workouts_user_date on workouts(user_id, date desc);
