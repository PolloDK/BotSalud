import { initialize, readRecords, getGrantedPermissions } from 'react-native-health-connect';
import type { HealthPayload } from './api';

// How many days back to sync (today + previous days) so that occasional missed
// syncs self-heal. Each day is read and stored as its OWN row — never summed together.
export const DAYS_TO_SYNC = 3;

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

// Read and aggregate a SINGLE local day into one payload.
const readDayData = async (win: { start: string; end: string; date: string }): Promise<HealthPayload> => {
  const { start, end, date } = win;
  const timeRangeFilter = { operator: 'between' as const, startTime: start, endTime: end };

  const [
    weightRecs, bodyFatRecs, leanMassRecs,
    stepsRecs, activeCalRecs, totalCalRecs,
    restingHRRecs, sleepRecs, exerciseRecs, nutritionRecs,
  ] = await Promise.all([
    safeRead('Weight', timeRangeFilter),
    safeRead('BodyFat', timeRangeFilter),
    safeRead('LeanBodyMass', timeRangeFilter),
    safeRead('Steps', timeRangeFilter),
    safeRead('ActiveCaloriesBurned', timeRangeFilter),
    safeRead('TotalCaloriesBurned', timeRangeFilter),
    safeRead('RestingHeartRate', timeRangeFilter),
    safeRead('SleepSession', timeRangeFilter),
    safeRead('ExerciseSession', timeRangeFilter),
    safeRead('Nutrition', timeRangeFilter),
  ]);

  const payload: HealthPayload = { date };

  const weights = weightRecs.records.map((r: any) => r.weight?.inKilograms).filter(Boolean);
  if (weights.length) payload.weight_kg = avg(weights);

  const fats = bodyFatRecs.records.map((r: any) => r.percentage).filter(Boolean);
  if (fats.length) payload.body_fat_pct = avg(fats);

  const lean = leanMassRecs.records.map((r: any) => r.mass?.inKilograms).filter(Boolean);
  if (lean.length) payload.lean_mass_kg = avg(lean);

  const steps = stepsRecs.records.map((r: any) => r.count).filter(Boolean);
  payload.steps = sum(steps);

  const activeCal = activeCalRecs.records.map((r: any) => r.energy?.inKilocalories).filter(Boolean);
  payload.active_cal = sum(activeCal) ? Math.round(sum(activeCal)!) : undefined;

  const totalCal = totalCalRecs.records.map((r: any) => r.energy?.inKilocalories).filter(Boolean);
  payload.total_cal = sum(totalCal) ? Math.round(sum(totalCal)!) : undefined;

  const hr = restingHRRecs.records.map((r: any) => r.beatsPerMinute).filter(Boolean);
  if (hr.length) payload.resting_hr = Math.round(avg(hr)!);

  if (sleepRecs.records.length) {
    const totalMs = sleepRecs.records.reduce((acc: number, r: any) => {
      return acc + (new Date(r.endTime).getTime() - new Date(r.startTime).getTime());
    }, 0);
    payload.sleep_hours = Math.round((totalMs / 3600000) * 10) / 10;
  }

  if (exerciseRecs.records.length) {
    payload.workout_count = exerciseRecs.records.length;
    const totalExerciseMs = exerciseRecs.records.reduce((acc: number, r: any) => {
      return acc + (new Date(r.endTime).getTime() - new Date(r.startTime).getTime());
    }, 0);
    payload.workout_minutes = Math.round(totalExerciseMs / 60000);
  }

  if (nutritionRecs.records.length) {
    const cals = nutritionRecs.records.map((r: any) => r.energy?.inKilocalories || 0);
    const prot = nutritionRecs.records.map((r: any) => r.protein?.inGrams || 0);
    const carbs = nutritionRecs.records.map((r: any) => r.totalCarbohydrate?.inGrams || 0);
    const fat = nutritionRecs.records.map((r: any) => r.totalFat?.inGrams || 0);
    const totalCalsIn = cals.reduce((a: number, b: number) => a + b, 0);
    if (totalCalsIn > 0) {
      payload.calories_in = Math.round(totalCalsIn);
      payload.protein_g = Math.round(prot.reduce((a: number, b: number) => a + b, 0) * 10) / 10;
      payload.carbs_g = Math.round(carbs.reduce((a: number, b: number) => a + b, 0) * 10) / 10;
      payload.fat_g = Math.round(fat.reduce((a: number, b: number) => a + b, 0) * 10) / 10;
    }
  }

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
