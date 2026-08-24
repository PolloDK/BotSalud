import { getToken } from '../storage';
import { readYesterdayData } from './healthConnect';
import { syncHealthData } from './api';

type SyncResult = 'success' | 'no-token' | 'error';

export const runSync = async (): Promise<SyncResult> => {
  const token = await getToken();
  if (!token) return 'no-token';
  try {
    const payload = await readYesterdayData();
    await syncHealthData(token, payload);
    return 'success';
  } catch {
    return 'error';
  }
};
