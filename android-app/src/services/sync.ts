import { getToken } from '../storage';
import { readYesterdayData } from './healthConnect';
import { syncHealthData } from './api';
import type { HealthPayload } from './api';

type SyncResult = 'success' | 'no-token' | 'error';

const todayDate = (): string => new Date().toISOString().slice(0, 10);

export const runSync = async (): Promise<SyncResult> => {
  const token = await getToken();
  if (!token) return 'no-token';

  let payload: HealthPayload;
  try {
    payload = await readYesterdayData();
  } catch {
    // Health Connect unavailable or permissions not granted — sync with just the date
    // so the backend call still validates the token and registers activity
    payload = { date: todayDate() };
  }

  try {
    await syncHealthData(token, payload);
    return 'success';
  } catch {
    return 'error';
  }
};
