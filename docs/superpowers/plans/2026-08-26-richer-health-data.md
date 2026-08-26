# Richer Health Connect Data (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture and store richer Health Connect data — daily heart rate (avg/min/max), full Hevy workout detail, sleep stages (deep/REM/light), Garmin activity (distance/floors/elevation), and extra Fitia nutrition — deduplicated across source apps.

**Architecture:** Extend the daily `health_snapshots` row with new scalar columns and add a separate `workouts` table (one row per session, idempotent by Health Connect record id). The app reads cumulative metrics via Health Connect's aggregate API (deduplicated) and per-session exercise records, and posts them in the existing per-day `/sync` payload. The FastAPI backend upserts the snapshot and the workouts.

**Tech Stack:** React Native 0.87 + react-native-health-connect 4.1.3 (app), FastAPI + supabase-py (backend), Postgres/Supabase (DB). Tests: jest (app), pytest (backend).

**Deploy order (important):** Backend + migration go FIRST (Tasks 1–2) so the backend accepts `workouts` before the new APK sends them. Then the app (Tasks 3–7).

---

### Task 1: Supabase migration 002 — new columns + workouts table

**Files:**
- Create: `supabase/migrations/002_richer_metrics.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration to Supabase**

Uses the service key from `backend/.env`. Confirm with the user before running (DDL on production DB).

Run from `backend/`:
```bash
python3 - <<'PY'
import re
env={}
for l in open('.env'):
    m=re.match(r'^([A-Z_]+)=(.*)$',l.strip())
    if m: env[m.group(1)]=m.group(2).strip().strip('"').strip("'")
from supabase import create_client
db=create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'])
sql=open('../supabase/migrations/002_richer_metrics.sql').read()
# supabase-py has no raw-SQL; apply via PostgREST RPC is unavailable, so use psql-style
# through the REST SQL endpoint is not exposed. Apply with the Supabase SQL editor OR
# the `postgrest` is read/write on tables only. For DDL use the connection string:
print("Run this SQL in the Supabase SQL editor, or via psql with the DB connection string.")
print(sql)
PY
```

Note: supabase-py cannot run DDL. Apply the SQL via the **Supabase dashboard SQL editor** (or `psql "$SUPABASE_DB_URL" -f supabase/migrations/002_richer_metrics.sql` if the direct connection string is available). Verify:
```bash
# after applying, verify columns exist
python3 - <<'PY'
import re
env={}
for l in open('.env'):
    m=re.match(r'^([A-Z_]+)=(.*)$',l.strip())
    if m: env[m.group(1)]=m.group(2).strip().strip('"').strip("'")
from supabase import create_client
db=create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'])
print(db.table('workouts').select('id').limit(1).execute().data)  # [] = table exists
print(db.table('health_snapshots').select('hr_avg,distance_km').limit(1).execute().data)
PY
```
Expected: no error; `workouts` returns `[]`, `health_snapshots` select succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_richer_metrics.sql
git commit -m "feat(db): migration 002 — richer metrics columns + workouts table"
```

---

### Task 2: Backend — accept new fields + workouts, upsert them

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/services/health_data.py`
- Modify: `backend/routers/sync.py`
- Test: `tests/test_models.py`, `tests/test_health_data.py`, `tests/test_sync.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_models.py`:
```python
def test_workout_in_and_payload_workouts():
    from models import HealthSyncPayload, WorkoutIn
    from datetime import date
    p = HealthSyncPayload(
        date=date(2026, 8, 24),
        hr_avg=72, hr_min=48, hr_max=150,
        distance_km=8.2, floors=12, elevation_m=45.0,
        sleep_light_h=4.1, fiber_g=30.0, sugar_g=40.0, sodium_mg=2300.0, sat_fat_g=12.0,
        workouts=[WorkoutIn(hc_id="abc", title="Pull Day", exercise_type=45,
                            duration_min=35, detail="Set 1: 54 kg x 12", source="com.hevy")],
    )
    assert p.hr_avg == 72
    assert p.workouts[0].hc_id == "abc"
```

Append to `tests/test_health_data.py`:
```python
def test_upsert_snapshot_excludes_workouts(mock_db):
    from services.health_data import upsert_snapshot
    from models import HealthSyncPayload, WorkoutIn
    payload = HealthSyncPayload(date=date(2026, 8, 24), steps=8000,
                                workouts=[WorkoutIn(hc_id="abc")])
    captured = {}
    def _upsert(data, on_conflict=None):
        captured["data"] = data
        m = MagicMock(); m.execute.return_value.data = [{"id": "uuid-1"}]; return m
    mock_db.table.return_value.upsert.side_effect = _upsert
    with patch("services.health_data.get_db", return_value=mock_db):
        upsert_snapshot("user-uuid", payload)
    assert "workouts" not in captured["data"]  # must not go into health_snapshots
    assert captured["data"]["steps"] == 8000

def test_upsert_workouts(mock_db):
    from services.health_data import upsert_workouts
    from models import WorkoutIn
    from datetime import date
    captured = {}
    def _upsert(rows, on_conflict=None):
        captured["rows"] = rows; captured["on_conflict"] = on_conflict
        m = MagicMock(); m.execute.return_value.data = [{"id": "w1"}]; return m
    mock_db.table.return_value.upsert.side_effect = _upsert
    with patch("services.health_data.get_db", return_value=mock_db):
        upsert_workouts("user-uuid", date(2026, 8, 24),
                        [WorkoutIn(hc_id="abc", title="Pull Day")])
    assert captured["on_conflict"] == "user_id,hc_uuid"
    assert captured["rows"][0]["hc_uuid"] == "abc"
    assert captured["rows"][0]["user_id"] == "user-uuid"
    assert captured["rows"][0]["date"] == "2026-08-24"
    assert "hc_id" not in captured["rows"][0]
```

Append to `tests/test_sync.py`:
```python
def test_sync_with_workouts_upserts_both(client):
    mock_user = {"id": "user-uuid", "telegram_id": 123}
    with patch("routers.sync.get_user_by_token", return_value=mock_user), \
         patch("routers.sync.upsert_snapshot", return_value=[{"id": "snap"}]) as m_snap, \
         patch("routers.sync.upsert_workouts", return_value=[{"id": "w1"}]) as m_wk, \
         patch("routers.sync.clear_sync_request"):
        response = client.post(
            "/sync",
            json={"date": "2026-08-24", "steps": 8000,
                  "workouts": [{"hc_id": "abc", "title": "Pull Day"}]},
            headers={"Authorization": "Bearer valid-token"},
        )
    assert response.status_code == 200
    m_snap.assert_called_once()
    m_wk.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/cristian/Proyectos/Otros/BotSalud && python3 -m pytest tests/test_models.py tests/test_health_data.py tests/test_sync.py -q`
Expected: FAIL (WorkoutIn/upsert_workouts not defined).

- [ ] **Step 3: Add fields + WorkoutIn to models.py**

In `backend/models.py`, add `datetime` import and the new fields. Replace the top imports and `HealthSyncPayload`:
```python
from datetime import date, datetime
from pydantic import BaseModel


class WorkoutIn(BaseModel):
    hc_id: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    source: str | None = None
    exercise_type: int | None = None
    title: str | None = None
    duration_min: int | None = None
    detail: str | None = None


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
    hr_avg: int | None = None
    hr_min: int | None = None
    hr_max: int | None = None
    sleep_hours: float | None = None
    sleep_deep_h: float | None = None
    sleep_rem_h: float | None = None
    sleep_light_h: float | None = None
    distance_km: float | None = None
    floors: int | None = None
    elevation_m: float | None = None
    workout_count: int | None = None
    workout_minutes: int | None = None
    calories_in: int | None = None
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None
    fiber_g: float | None = None
    sugar_g: float | None = None
    sodium_mg: float | None = None
    sat_fat_g: float | None = None
    raw_json: dict | None = None
    workouts: list[WorkoutIn] | None = None
```

- [ ] **Step 4: Add upsert_workouts + exclude workouts in upsert_snapshot**

In `backend/services/health_data.py`, replace `upsert_snapshot` and add `upsert_workouts`:
```python
def upsert_snapshot(user_id: str, payload: HealthSyncPayload) -> list:
    data = payload.model_dump(exclude_none=True, exclude={"workouts"})
    data["user_id"] = user_id
    data["date"] = str(data["date"])
    return get_db().table("health_snapshots").upsert(data, on_conflict="user_id,date").execute().data

def upsert_workouts(user_id: str, day, workouts: list) -> list:
    if not workouts:
        return []
    rows = []
    for w in workouts:
        row = w.model_dump(exclude_none=True)
        row["hc_uuid"] = row.pop("hc_id")
        row["user_id"] = user_id
        row["date"] = str(day)
        if row.get("start_time"):
            row["start_time"] = str(row["start_time"])
        if row.get("end_time"):
            row["end_time"] = str(row["end_time"])
        rows.append(row)
    return get_db().table("workouts").upsert(rows, on_conflict="user_id,hc_uuid").execute().data
```

- [ ] **Step 5: Wire workouts into the /sync route**

In `backend/routers/sync.py`, update the import and the handler body:
```python
from services.health_data import (
    get_user_by_token, upsert_snapshot, upsert_workouts,
    is_sync_pending, clear_sync_request,
)
```
And inside `sync_health_data`, after `upsert_snapshot(...)`:
```python
    upsert_snapshot(user["id"], payload)
    if payload.workouts:
        upsert_workouts(user["id"], payload.date, payload.workouts)
    clear_sync_request(user["id"])
    return {"status": "ok"}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /home/cristian/Proyectos/Otros/BotSalud && python3 -m pytest tests/ -q`
Expected: PASS (all backend tests).

- [ ] **Step 7: Commit**

```bash
git add backend/models.py backend/services/health_data.py backend/routers/sync.py tests/test_models.py tests/test_health_data.py tests/test_sync.py
git commit -m "feat(backend): accept richer metrics + workouts in /sync"
```

---

### Task 3: App — request the new Health Connect permissions

**Files:**
- Modify: `android-app/android/app/src/main/AndroidManifest.xml`
- Modify: `android-app/android/app/src/main/res/values/health_permissions.xml`
- Modify: `android-app/src/screens/SetupScreen.tsx:17-28` (PERMISSIONS array)

- [ ] **Step 1: Add uses-permission entries to the manifest**

In `AndroidManifest.xml`, after the existing `READ_...` health permissions block, add:
```xml
    <uses-permission android:name="android.permission.health.READ_HEART_RATE" />
    <uses-permission android:name="android.permission.health.READ_DISTANCE" />
    <uses-permission android:name="android.permission.health.READ_FLOORS_CLIMBED" />
    <uses-permission android:name="android.permission.health.READ_ELEVATION_GAINED" />
```

- [ ] **Step 2: Add to the health_permissions array**

In `res/values/health_permissions.xml`, add inside `<array name="health_permissions">`:
```xml
        <item>androidx.health.permission.HeartRate.READ</item>
        <item>androidx.health.permission.Distance.READ</item>
        <item>androidx.health.permission.FloorsClimbed.READ</item>
        <item>androidx.health.permission.ElevationGained.READ</item>
```

- [ ] **Step 3: Add to the PERMISSIONS array in SetupScreen.tsx**

In `android-app/src/screens/SetupScreen.tsx`, extend the `PERMISSIONS` const:
```tsx
const PERMISSIONS = [
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'BodyFat' },
  { accessType: 'read', recordType: 'LeanBodyMass' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Nutrition' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'FloorsClimbed' },
  { accessType: 'read', recordType: 'ElevationGained' },
];
```

- [ ] **Step 4: Run the app test suite (no behavior change expected)**

Run: `cd android-app && npx jest --no-coverage`
Expected: PASS (SetupScreen tests still pass; REQUIRED_TYPES grows but tests don't assert its length).

- [ ] **Step 5: Commit**

```bash
git add android-app/android/app/src/main/AndroidManifest.xml android-app/android/app/src/main/res/values/health_permissions.xml android-app/src/screens/SetupScreen.tsx
git commit -m "feat(android): request heart rate, distance, floors, elevation HC permissions"
```

---

### Task 4: App — extend the payload type

**Files:**
- Modify: `android-app/src/services/api.ts`

- [ ] **Step 1: Add WorkoutPayload and new fields to HealthPayload**

In `android-app/src/services/api.ts`, add the interface and fields:
```ts
export interface WorkoutPayload {
  hc_id: string;
  start_time?: string;
  end_time?: string;
  source?: string;
  exercise_type?: number;
  title?: string;
  duration_min?: number;
  detail?: string;
}

export interface HealthPayload {
  date: string;
  weight_kg?: number;
  body_fat_pct?: number;
  lean_mass_kg?: number;
  steps?: number;
  active_cal?: number;
  total_cal?: number;
  resting_hr?: number;
  hr_avg?: number;
  hr_min?: number;
  hr_max?: number;
  sleep_hours?: number;
  sleep_deep_h?: number;
  sleep_rem_h?: number;
  sleep_light_h?: number;
  distance_km?: number;
  floors?: number;
  elevation_m?: number;
  workout_count?: number;
  workout_minutes?: number;
  calories_in?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  sat_fat_g?: number;
  workouts?: WorkoutPayload[];
}
```
(Keep the existing `syncHealthData` and `checkSyncPending` functions unchanged.)

- [ ] **Step 2: Type-check**

Run: `cd android-app && npx tsc --noEmit 2>&1 | grep -v "appState.current" | grep "api.ts" || echo "no api.ts type errors"`
Expected: `no api.ts type errors`.

- [ ] **Step 3: Commit**

```bash
git add android-app/src/services/api.ts
git commit -m "feat(android): extend HealthPayload with rich metrics + workouts"
```

---

### Task 5: App — read the new metrics and build workouts

**Files:**
- Modify: `android-app/src/services/healthConnect.ts`
- Modify: `android-app/__mocks__/react-native-health-connect.js`
- Test: `android-app/__tests__/healthConnect.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `android-app/__tests__/healthConnect.test.ts`:
```ts
it('reads heart-rate avg/min/max from the aggregate API', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  mockHC.aggregateRecord.mockImplementation((req: any) => {
    if (req.recordType === 'HeartRate') return Promise.resolve({ BPM_AVG: 72, BPM_MIN: 48, BPM_MAX: 150 });
    return Promise.resolve({});
  });
  const [today] = await readRecentDays(1);
  expect(today.hr_avg).toBe(72);
  expect(today.hr_min).toBe(48);
  expect(today.hr_max).toBe(150);
});

it('reads distance km, floors and elevation from aggregates', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.readRecords.mockResolvedValue({ records: [] });
  mockHC.aggregateRecord.mockImplementation((req: any) => {
    if (req.recordType === 'Distance') return Promise.resolve({ DISTANCE: { inKilometers: 8.2 } });
    if (req.recordType === 'FloorsClimbed') return Promise.resolve({ FLOORS_CLIMBED_TOTAL: 12 });
    if (req.recordType === 'ElevationGained') return Promise.resolve({ ELEVATION_GAINED_TOTAL: { inMeters: 45 } });
    return Promise.resolve({});
  });
  const [today] = await readRecentDays(1);
  expect(today.distance_km).toBe(8.2);
  expect(today.floors).toBe(12);
  expect(today.elevation_m).toBe(45);
});

it('computes sleep stage hours from SleepSession stages', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.aggregateRecord.mockResolvedValue({});
  mockHC.readRecords.mockImplementation((type: string) => {
    if (type === 'SleepSession') return Promise.resolve({ records: [{
      startTime: '2026-08-24T00:00:00.000Z', endTime: '2026-08-24T08:00:00.000Z',
      stages: [
        { stage: 5, startTime: '2026-08-24T00:00:00.000Z', endTime: '2026-08-24T02:00:00.000Z' }, // deep 2h
        { stage: 6, startTime: '2026-08-24T02:00:00.000Z', endTime: '2026-08-24T03:30:00.000Z' }, // rem 1.5h
        { stage: 4, startTime: '2026-08-24T03:30:00.000Z', endTime: '2026-08-24T08:00:00.000Z' }, // light 4.5h
      ],
    }] });
    return Promise.resolve({ records: [] });
  });
  const [today] = await readRecentDays(1);
  expect(today.sleep_deep_h).toBe(2);
  expect(today.sleep_rem_h).toBe(1.5);
  expect(today.sleep_light_h).toBe(4.5);
});

it('builds a workout per ExerciseSession record with detail and source', async () => {
  mockHC.initialize.mockResolvedValue(true);
  mockHC.aggregateRecord.mockResolvedValue({});
  mockHC.readRecords.mockImplementation((type: string) => {
    if (type === 'ExerciseSession') return Promise.resolve({ records: [{
      metadata: { id: 'hc-1', dataOrigin: 'com.hevy' },
      exerciseType: 45, title: 'Pull Day', notes: 'Set 1: 54 kg x 12',
      startTime: '2026-08-24T18:00:00.000Z', endTime: '2026-08-24T18:35:00.000Z',
    }] });
    return Promise.resolve({ records: [] });
  });
  const [today] = await readRecentDays(1);
  expect(today.workouts).toHaveLength(1);
  expect(today.workouts![0]).toMatchObject({
    hc_id: 'hc-1', source: 'com.hevy', exercise_type: 45,
    title: 'Pull Day', detail: 'Set 1: 54 kg x 12', duration_min: 35,
  });
});
```

- [ ] **Step 2: Add aggregateRecord to the mock**

In `android-app/__mocks__/react-native-health-connect.js`, ensure `aggregateRecord` exists (it does from a prior change: `aggregateRecord: jest.fn(() => Promise.resolve({}))`). No change needed; confirm it is present.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd android-app && npx jest --no-coverage healthConnect`
Expected: FAIL (hr_avg/distance_km/sleep_deep_h/workouts undefined).

- [ ] **Step 4: Implement in healthConnect.ts**

In `android-app/src/services/healthConnect.ts`, inside `readDayData`, extend the `Promise.all` to also read SleepSession records and aggregate HR/Distance/Floors/Elevation, then map the results. Replace the destructuring/Promise.all block and add the new payload assignments:

```ts
  const [
    weightRecs, bodyFatRecs, leanMassRecs, restingHRRecs, exerciseRecs, sleepRecs,
    stepsAgg, activeCalAgg, totalCalAgg, sleepAgg, exerciseAgg, nutritionAgg,
    hrAgg, distanceAgg, floorsAgg, elevationAgg,
  ] = await Promise.all([
    safeRead('Weight', timeRangeFilter),
    safeRead('BodyFat', timeRangeFilter),
    safeRead('LeanBodyMass', timeRangeFilter),
    safeRead('RestingHeartRate', timeRangeFilter),
    safeRead('ExerciseSession', timeRangeFilter),
    safeRead('SleepSession', timeRangeFilter),
    safeAggregate('Steps', timeRangeFilter),
    safeAggregate('ActiveCaloriesBurned', timeRangeFilter),
    safeAggregate('TotalCaloriesBurned', timeRangeFilter),
    safeAggregate('SleepSession', timeRangeFilter),
    safeAggregate('ExerciseSession', timeRangeFilter),
    safeAggregate('Nutrition', timeRangeFilter),
    safeAggregate('HeartRate', timeRangeFilter),
    safeAggregate('Distance', timeRangeFilter),
    safeAggregate('FloorsClimbed', timeRangeFilter),
    safeAggregate('ElevationGained', timeRangeFilter),
  ]);
```

Keep all existing payload assignments (weight, bodyfat, lean, resting_hr, steps, active/total cal, sleep_hours from `sleepAgg`, workout_minutes from `exerciseAgg`, nutrition). Then ADD, before `return payload;`:

```ts
  // Heart rate (deduplicated aggregate)
  const hrAvg = hrAgg?.BPM_AVG;
  if (hrAvg) payload.hr_avg = Math.round(hrAvg);
  const hrMin = hrAgg?.BPM_MIN;
  if (hrMin) payload.hr_min = Math.round(hrMin);
  const hrMax = hrAgg?.BPM_MAX;
  if (hrMax) payload.hr_max = Math.round(hrMax);

  // Activity
  const distanceKm = distanceAgg?.DISTANCE?.inKilometers;
  if (distanceKm) payload.distance_km = Math.round(distanceKm * 100) / 100;
  const floors = floorsAgg?.FLOORS_CLIMBED_TOTAL;
  if (floors) payload.floors = Math.round(floors);
  const elevationM = elevationAgg?.ELEVATION_GAINED_TOTAL?.inMeters;
  if (elevationM) payload.elevation_m = Math.round(elevationM * 10) / 10;

  // Sleep stages (deep=5, rem=6, light=4) summed from session stages
  const stageHours = (stageType: number): number => {
    let ms = 0;
    for (const rec of sleepRecs.records) {
      for (const st of (rec.stages ?? [])) {
        if (st.stage === stageType) {
          ms += new Date(st.endTime).getTime() - new Date(st.startTime).getTime();
        }
      }
    }
    return Math.round((ms / 3600000) * 10) / 10;
  };
  const deep = stageHours(5);
  if (deep) payload.sleep_deep_h = deep;
  const rem = stageHours(6);
  if (rem) payload.sleep_rem_h = rem;
  const light = stageHours(4);
  if (light) payload.sleep_light_h = light;

  // Nutrition extras (in the existing nutrition block, alongside protein/carbs/fat)
  const fiber = nutritionAgg?.DIETARY_FIBER_TOTAL?.inGrams;
  if (fiber != null) payload.fiber_g = Math.round(fiber * 10) / 10;
  const sugar = nutritionAgg?.SUGAR_TOTAL?.inGrams;
  if (sugar != null) payload.sugar_g = Math.round(sugar * 10) / 10;
  const sodium = nutritionAgg?.SODIUM_TOTAL?.inMilligrams;
  if (sodium != null) payload.sodium_mg = Math.round(sodium * 10) / 10;
  const satFat = nutritionAgg?.SATURATED_FAT_TOTAL?.inGrams;
  if (satFat != null) payload.sat_fat_g = Math.round(satFat * 10) / 10;

  // Workouts: one entry per ExerciseSession record
  const workouts = exerciseRecs.records
    .map((r: any) => ({
      hc_id: r.metadata?.id,
      source: r.metadata?.dataOrigin,
      exercise_type: r.exerciseType,
      title: r.title || undefined,
      detail: r.notes || undefined,
      start_time: r.startTime,
      end_time: r.endTime,
      duration_min: (r.startTime && r.endTime)
        ? Math.round((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000)
        : undefined,
    }))
    .filter((w: any) => w.hc_id);
  if (workouts.length) payload.workouts = workouts;
```

Aggregate keys are verified against `ReactNutritionRecord.kt`: `DIETARY_FIBER_TOTAL`, `SUGAR_TOTAL`, `SODIUM_TOTAL`, `SATURATED_FAT_TOTAL` (all via `massToJsMap`, exposing `inGrams`/`inMilligrams`). Distance aggregate output key is `DISTANCE` (via `lengthToJsMap`, exposing `inKilometers`). If a field is absent the optional chain yields `undefined` and the line is skipped (safe).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd android-app && npx jest --no-coverage healthConnect`
Expected: PASS.

- [ ] **Step 6: Run full app suite**

Run: `cd android-app && npx jest --no-coverage`
Expected: PASS (all suites).

- [ ] **Step 7: Commit**

```bash
git add android-app/src/services/healthConnect.ts android-app/__tests__/healthConnect.test.ts android-app/__mocks__/react-native-health-connect.js
git commit -m "feat(android): read HR/distance/floors/elevation/sleep-stages + build workouts"
```

---

### Task 6: App — bump BACKFILL_VERSION to re-backfill with rich data

**Files:**
- Modify: `android-app/src/services/healthConnect.ts` (BACKFILL_VERSION)
- Modify: `android-app/__tests__/sync.test.ts` (mocked BACKFILL_VERSION)

- [ ] **Step 1: Bump the constant**

In `android-app/src/services/healthConnect.ts`, change:
```ts
export const BACKFILL_VERSION = 3;
```
(comment: `v3 = rich metrics + workouts`).

- [ ] **Step 2: Update the sync test mock to match**

In `android-app/__tests__/sync.test.ts`, in the `jest.mock('../src/services/healthConnect', ...)` factory, set `BACKFILL_VERSION: 3`, and in the two backfill tests keep behavior: the "re-backfill" test uses `mockBackfillVersion.mockResolvedValue(2)` (behind) and asserts `mockSetBackfill` called with `3`; the "current" test uses `mockResolvedValue(3)`. Also update `beforeEach` default `mockBackfillVersion.mockResolvedValue(3)`.

Concretely, change these lines:
```ts
  BACKFILL_VERSION: 3,
```
```ts
  mockBackfillVersion.mockResolvedValue(3); // in beforeEach
```
```ts
  // in "re-backfills..." test:
  mockBackfillVersion.mockResolvedValue(2);
  ...
  expect(mockSetBackfill).toHaveBeenCalledWith(3);
```
```ts
  // in "uses the short rolling window..." test:
  mockBackfillVersion.mockResolvedValue(3);
```

- [ ] **Step 3: Run the sync tests**

Run: `cd android-app && npx jest --no-coverage sync`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add android-app/src/services/healthConnect.ts android-app/__tests__/sync.test.ts
git commit -m "feat(android): bump BACKFILL_VERSION to 3 to re-backfill rich metrics"
```

---

### Task 7: Deploy and verify

**Files:** none (operational)

- [ ] **Step 1: Push backend + migration first**

Push commits from Tasks 1–2 (and 3–6) to master. Backend auto-deploys from GitHub.
```bash
git push origin master
```

- [ ] **Step 2: Confirm the migration is applied to Supabase** (Task 1 Step 2 already did this) and confirm the backend accepts a workouts payload:
```bash
# expect 401 (no token) — proves the route parses the new schema without 422
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"date":"2026-08-24","hr_avg":72,"workouts":[{"hc_id":"x","title":"Pull Day"}]}' \
  https://botsalud-production.up.railway.app/sync
```
Expected: `{"detail":"Missing auth token"}` (HTTP 401) — NOT a 422 validation error.

- [ ] **Step 3: Build APK**

Push already triggered CI. Watch the run and confirm a new `build-N` release with `app-release.apk`.
```bash
gh run list --workflow="Build Android APK" --repo PolloDK/BotSalud --limit 1
```

- [ ] **Step 4: User installs APK and re-grants permissions**

Instruct the user: install the new APK, open BotSalud, tap "Conceder permisos Health Connect", and grant the NEW permissions (heart rate, distance, floors, elevation). Then "Sincronizar ahora" (re-backfills ~35 days with rich data).

- [ ] **Step 5: Verify data in Supabase (read-only)**

```bash
cd backend && python3 - <<'PY'
import re
env={}
for l in open('.env'):
    m=re.match(r'^([A-Z_]+)=(.*)$',l.strip())
    if m: env[m.group(1)]=m.group(2).strip().strip('"').strip("'")
from supabase import create_client
db=create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'])
print("snapshots:", db.table('health_snapshots').select('date,hr_avg,hr_min,hr_max,distance_km,sleep_deep_h,sleep_rem_h').order('date',desc=True).limit(5).execute().data)
print("workouts:", db.table('workouts').select('date,source,title,duration_min').order('date',desc=True).limit(5).execute().data)
PY
```
Expected: snapshots show hr_avg/min/max and sleep stages; workouts table has Hevy sessions with titles.

---

## Notes for the implementer

- **Deploy order matters:** backend + migration must be live before the APK sends `workouts` (else workouts are silently dropped until backend updates — no hard break).
- **Aggregate key names are verified** against the library source (`DISTANCE`, `DIETARY_FIBER_TOTAL`, `SUGAR_TOTAL`, `SODIUM_TOTAL`, `SATURATED_FAT_TOTAL`, `BPM_AVG/MIN/MAX`, `FLOORS_CLIMBED_TOTAL`, `ELEVATION_GAINED_TOTAL`). Optional chaining keeps any absent field safe.
- **Migration application:** supabase-py cannot run DDL. Apply `002_richer_metrics.sql` via the Supabase dashboard SQL editor, or `supabase db push` if the project is linked with its DB password. Confirm with the user which they prefer.
- **Permissions:** the user MUST grant the new HC permissions or heart/distance fields stay empty (clean degradation, no crash).
