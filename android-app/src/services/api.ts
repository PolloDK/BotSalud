import axios from 'axios';

const BASE_URL = 'https://botsalud-production.up.railway.app';

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

export const syncHealthData = (token: string, payload: HealthPayload): Promise<void> =>
  axios.post(`${BASE_URL}/sync`, payload, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });

export const checkSyncPending = async (token: string): Promise<boolean> => {
  const res = await axios.get(`${BASE_URL}/sync/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.pending === true;
};
