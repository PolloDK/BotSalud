import { initialize, readRecords, getGrantedPermissions } from 'react-native-health-connect';
import type { HealthPayload } from './api';

// Read the last 48h so we catch data synced today AND yesterday
const recentWindow = (): { start: string; end: string; date: string } => {
  const end = new Date();
  const start = new Date(end.getTime() - 48 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  const date = new Date().toISOString().slice(0, 10);
  return { start: start.toISOString(), end: end.toISOString(), date };
};

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

export const readYesterdayData = async (): Promise<HealthPayload> => {
  await initialize();
  const { start, end, date } = recentWindow();
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
