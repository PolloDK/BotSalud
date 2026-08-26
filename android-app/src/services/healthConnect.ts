import { initialize, readRecords, getGrantedPermissions, aggregateRecord } from 'react-native-health-connect';
import type { HealthPayload } from './api';

// Rolling window synced on every run so recent days self-heal. Each day is read
// and stored as its OWN row — never summed together.
export const DAYS_TO_SYNC = 4;

// One-time historical backfill window (~a bit over a month) run on first sync.
export const BACKFILL_DAYS = 35;

// Bump when the aggregation logic changes so a corrected backfill re-runs once
// and overwrites previously-stored (wrong) history. v2 = dedup via aggregate API.
export const BACKFILL_VERSION = 2;

// Local YYYY-MM-DD (NOT UTC) so the row's date matches the user's calendar day.
const localDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Time window for a single local calendar day `daysAgo` days before today.
// Boundaries are local midnight -> next local midnight (end clamped to "now" for today).
const dayWindow = (daysAgo: number): { start: string; end: string; date: string } => {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setDate(now.getDate() - daysAgo);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(dayStart.getDate() + 1);
  const end = nextDay.getTime() > now.getTime() ? now : nextDay;
  return { start: dayStart.toISOString(), end: end.toISOString(), date: localDateStr(dayStart) };
};

export const todayLocalDate = (): string => localDateStr(new Date());

const avg = (nums: number[]): number | undefined =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;

const sum = (nums: number[]): number | undefined =>
  nums.length ? nums.reduce((a, b) => a + b, 0) : undefined;

export const checkGrantedPermissions = async (): Promise<string[]> => {
  await initialize();
  const granted = await getGrantedPermissions();
  return granted.map((p: any) => p.recordType);
};

const safeRead = async (type: string, filter: any): Promise<{ records: any[] }> => {
  try {
    return await readRecords(type as any, { timeRangeFilter: filter });
  } catch {
    return { records: [] };
  }
};

// Aggregate a cumulative metric. Health Connect's aggregate API DEDUPLICATES
// overlapping data written by multiple apps (Garmin, Samsung Health, Strava, ...)
// using its per-type priority list — so totals aren't double/triple counted.
const safeAggregate = async (type: string, filter: any): Promise<any | null> => {
  try {
    return await aggregateRecord({ recordType: type as any, timeRangeFilter: filter } as any);
  } catch {
    return null;
  }
};

// Read and aggregate a SINGLE local day into one payload.
const readDayData = async (win: { start: string; end: string; date: string }): Promise<HealthPayload> => {
  const { start, end, date } = win;
  const timeRangeFilter = { operator: 'between' as const, startTime: start, endTime: end };

  const [
    // Samples: not summed, so multiple sources don't inflate — averaged from records.
    weightRecs, bodyFatRecs, leanMassRecs, restingHRRecs, exerciseRecs, sleepRecs,
    // Cumulative: aggregated (deduplicated across apps) — see safeAggregate.
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

  const payload: HealthPayload = { date };

  const weights = weightRecs.records.map((r: any) => r.weight?.inKilograms).filter(Boolean);
  if (weights.length) payload.weight_kg = avg(weights);

  const fats = bodyFatRecs.records.map((r: any) => r.percentage).filter(Boolean);
  if (fats.length) payload.body_fat_pct = avg(fats);

  const lean = leanMassRecs.records.map((r: any) => r.mass?.inKilograms).filter(Boolean);
  if (lean.length) payload.lean_mass_kg = avg(lean);

  const hr = restingHRRecs.records.map((r: any) => r.beatsPerMinute).filter(Boolean);
  if (hr.length) payload.resting_hr = Math.round(avg(hr)!);

  const steps = stepsAgg?.COUNT_TOTAL;
  if (steps) payload.steps = Math.round(steps);

  const activeCal = activeCalAgg?.ACTIVE_CALORIES_TOTAL?.inKilocalories;
  if (activeCal) payload.active_cal = Math.round(activeCal);

  const totalCal = totalCalAgg?.ENERGY_TOTAL?.inKilocalories;
  if (totalCal) payload.total_cal = Math.round(totalCal);

  const sleepSeconds = sleepAgg?.SLEEP_DURATION_TOTAL;
  if (sleepSeconds) payload.sleep_hours = Math.round((sleepSeconds / 3600) * 10) / 10;

  const exerciseSeconds = exerciseAgg?.EXERCISE_DURATION_TOTAL;
  if (exerciseSeconds) payload.workout_minutes = Math.round(exerciseSeconds / 60);
  // Count of sessions has no dedup aggregate; approximate from records.
  if (exerciseRecs.records.length) payload.workout_count = exerciseRecs.records.length;

  const caloriesIn = nutritionAgg?.ENERGY_TOTAL?.inKilocalories;
  if (caloriesIn && caloriesIn > 0) {
    payload.calories_in = Math.round(caloriesIn);
    const prot = nutritionAgg?.PROTEIN_TOTAL?.inGrams;
    const carbs = nutritionAgg?.TOTAL_CARBOHYDRATE_TOTAL?.inGrams;
    const fat = nutritionAgg?.TOTAL_FAT_TOTAL?.inGrams;
    if (prot != null) payload.protein_g = Math.round(prot * 10) / 10;
    if (carbs != null) payload.carbs_g = Math.round(carbs * 10) / 10;
    if (fat != null) payload.fat_g = Math.round(fat * 10) / 10;
  }

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

  return payload;
};

// Read the last `numDays` local days, one payload per day (oldest first).
// Each day is scoped by its own time window, so days are NEVER summed together.
export const readRecentDays = async (numDays: number = DAYS_TO_SYNC): Promise<HealthPayload[]> => {
  await initialize();
  const payloads: HealthPayload[] = [];
  for (let daysAgo = numDays - 1; daysAgo >= 0; daysAgo--) {
    payloads.push(await readDayData(dayWindow(daysAgo)));
  }
  return payloads;
};
