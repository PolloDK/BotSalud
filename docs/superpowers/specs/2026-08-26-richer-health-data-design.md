# Datos de salud más ricos — Diseño (Etapa 1)

Fecha: 2026-08-26
Estado: aprobado (alcance Etapa 1)

## Contexto y objetivo

Hoy la app captura métricas diarias escalares y muy poco de entrenamientos
(solo `workout_count` y `workout_minutes`) y de corazón (solo `resting_hr`).
El export de Health Connect del usuario muestra muchísima data sin aprovechar:

- `heart_rate_record_table`: 68.826 registros (Garmin) — solo usamos reposo.
- `exercise_session_record_table`: 97 sesiones; **Hevy escribe el entreno completo
  (ejercicios/series/reps/peso) en el campo `notes`**, con título ("Pull Day") y URL.
- `sleep_stages_table`: 1.706 filas (profundo/REM/ligero) — el modelo ya tiene
  `sleep_deep_h`/`sleep_rem_h` pero nunca se poblaron.
- `distance` (198), `floors_climbed` (602), `elevation_gained` (1.129) — Garmin.
- `nutrition` (302, Fitia): hoy energía/macros; hay fibra/azúcar/sodio/grasa sat.

Apps conectadas a HC: Fitia, Hevy, Garmin Connect, Samsung Health, Strava,
Mibro Fit, Smart Fit.

El objetivo final (en 3 etapas) es: (1) capturar y guardar datos ricos,
(2) chat del bot con ese contexto + reporte semanal mejor, (3) gráficos y
`/resumen` on-demand. **Este spec cubre solo la Etapa 1.**

## Alcance Etapa 1

Capturar y almacenar:
- **Corazón**: FC promedio/mínima/máxima del día (además de reposo). Deduplicado
  vía aggregate API (BPM_AVG/BPM_MIN/BPM_MAX).
- **Entrenos Hevy con detalle completo**: una fila por sesión con el desglose.
- **Etapas de sueño**: profundo/REM/ligero, desde `stages[]` de cada SleepSession.
- **Actividad Garmin**: distancia (km), pisos, elevación (m). Aggregate.
- **Nutrición extra (Fitia)**: fibra, azúcar, sodio, grasa saturada.

Fuera de alcance (Etapas 2/3): chat con contexto rico, reporte HTML/tablas,
gráficos (QuickChart), comando `/resumen`.

## Modelo de datos (Supabase, migración `002_richer_metrics.sql`)

### Ampliar `health_snapshots` (columnas nuevas, todas nullable)
- Corazón: `hr_avg int`, `hr_min int`, `hr_max int`
- Sueño: `sleep_light_h numeric(4,2)` (ya existen `sleep_deep_h`, `sleep_rem_h`)
- Actividad: `distance_km numeric(6,2)`, `floors int`, `elevation_m numeric(7,2)`
- Nutrición: `fiber_g numeric(6,2)`, `sugar_g numeric(6,2)`, `sodium_mg numeric(7,1)`, `sat_fat_g numeric(6,2)`

### Tabla nueva `workouts`
```
create table if not exists workouts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  hc_uuid       text not null,            -- Health Connect record metadata.id
  date          date not null,            -- local day of the session start
  start_time    timestamptz,
  end_time      timestamptz,
  source        text,                     -- app package (com.hevy, com.garmin...)
  exercise_type int,                      -- HC exercise type code
  title         text,                     -- "Pull Day"
  duration_min  int,
  detail        text,                     -- full Hevy breakdown (notes)
  created_at    timestamptz not null default now(),
  unique(user_id, hc_uuid)                -- idempotent upsert on re-sync/backfill
);
create index if not exists idx_workouts_user_date on workouts(user_id, date desc);
```
La migración se aplica directamente a Supabase (con el service key) — no la
despliega Railway. Se ejecuta como paso de implementación, con confirmación.

## Cambios en la app (React Native)

### Permisos nuevos (nativo → APK nuevo + re-otorgar)
Agregar a `AndroidManifest.xml`, `health_permissions.xml` y a `PERMISSIONS`
en `SetupScreen.tsx`:
- `READ_HEART_RATE`, `READ_DISTANCE`, `READ_FLOORS_CLIMBED`, `READ_ELEVATION_GAINED`.
- Sueño (`READ_SLEEP`) y ejercicio (`READ_EXERCISE`) ya están concedidos.

### `healthConnect.ts` — `readDayData(win)`
- **Corazón**: `safeAggregate('HeartRate')` → `BPM_AVG/BPM_MIN/BPM_MAX` → redondear a int.
- **Distancia**: `safeAggregate('Distance')` → `DISTANCE_TOTAL.inKilometers`.
- **Pisos**: `safeAggregate('FloorsClimbed')` → `FLOORS_CLIMBED_TOTAL` → int.
- **Elevación**: `safeAggregate('ElevationGained')` → `ELEVATION_GAINED_TOTAL.inMeters`.
- **Etapas de sueño**: `safeRead('SleepSession')` → por cada record recorrer
  `stages[]` y sumar `(endTime-startTime)` por tipo: profundo=5, REM=6, ligero=4.
  El total `sleep_hours` sigue viniendo del aggregate `SLEEP_DURATION_TOTAL`.
- **Entrenos**: `safeRead('ExerciseSession')` → por cada record construir un objeto
  workout: `{ hc_id: metadata.id, start, end, source: metadata.dataOrigin,
  exercise_type, title, duration_min, detail: notes }`. Se devuelven en el payload
  del día en un arreglo `workouts`.

### Payload (`api.ts`) y tipo `HealthPayload`
- Nuevos campos escalares diarios (hr_avg/min/max, sleep_light_h, distance_km,
  floors, elevation_m, fiber_g, sugar_g, sodium_mg, sat_fat_g).
- Nuevo campo `workouts?: WorkoutPayload[]`.

### Backfill
- Subir `BACKFILL_VERSION` a **3** para re-procesar ~35 días con los datos nuevos.
  La lógica resiliente de sync (día más nuevo primero, por-día independiente,
  throttle, timeout) se mantiene sin cambios.

## Cambios en el backend (FastAPI, auto-deploy desde GitHub)

- `models.py`: agregar los campos escalares nuevos a `HealthSyncPayload` y un
  `workouts: list[WorkoutIn] | None`, con `WorkoutIn` (hc_id, start, end, source,
  exercise_type, title, duration_min, detail).
- `services/health_data.py`: `upsert_workouts(user_id, date, workouts)` →
  upsert en `workouts` con `on_conflict="user_id,hc_uuid"`. El snapshot diario
  sigue por `upsert_snapshot` (los campos nuevos entran solos vía `model_dump`).
- `routers/sync.py`: en `POST /sync`, tras `upsert_snapshot`, si vienen
  `workouts`, llamar `upsert_workouts`. Mantener respuesta `{"status":"ok"}`.

## Flujo de datos

App lee día → arma snapshot + workouts[] → `POST /sync` (una vez por día,
día más nuevo primero) → backend upserta snapshot (por user+date) y workouts
(por user+hc_uuid) → Supabase.

## Manejo de errores / bordes

- Cada `safeAggregate`/`safeRead` ya devuelve vacío ante error o permiso faltante;
  los campos quedan `undefined` y no rompen el sync.
- Idempotencia: `workouts` por `(user_id, hc_uuid)`; re-backfill no duplica.
- `exclude_none` en el backend: un campo nulo no pisa un valor previo. Para
  entrenos no aplica (tabla propia con upsert por hc_uuid).
- Multi-fuente en etapas de sueño: si dos apps registran sueño el mismo día, las
  etapas podrían sumar de más; poco frecuente. Se documenta como limitación menor.
- Tamaño del payload: el `detail` de Hevy puede ser largo; se envía en el POST del
  día correspondiente (≤ pocos KB por sesión). Aceptable.

## Testing

- `healthConnect.test.ts`: FC desde aggregate (avg/min/max), distancia/pisos/
  elevación desde aggregate, etapas de sueño desde `stages[]`, y construcción del
  arreglo `workouts` desde ExerciseSession (incluyendo `hc_id` y `detail`).
- `sync.test.ts`: el payload incluye `workouts`; `BACKFILL_VERSION=3` fuerza
  re-backfill; se mantienen los tests de resiliencia.
- Mock `react-native-health-connect`: agregar formas de aggregate para HR/Distance/
  Floors/Elevation y de `stages` en SleepSession.
- Backend: test de `POST /sync` con `workouts` → verifica upsert idempotente.

## Despliegue

1. Aplicar migración `002` a Supabase (service key), con confirmación.
2. Push a master → Railway auto-despliega el backend.
3. CI compila APK nuevo (permisos nuevos) → el usuario instala y **re-otorga
   permisos** de Health Connect (ahora incluye corazón/distancia).
4. Primera sync re-hace backfill v3 con los datos ricos.

## Riesgos

- Permisos: el usuario debe conceder los nuevos permisos de HC; si no, esos
  campos quedan vacíos (degradación limpia, sin crash).
- Orden de despliegue: el backend nuevo (que acepta `workouts`) debe estar
  desplegado antes de que el APK nuevo envíe `workouts`; como el backend ignora
  campos extra si aún no está actualizado, no hay ruptura dura, solo se perderían
  workouts hasta que despliegue.
