import { getToken } from '../storage';
import { readYesterdayData } from './healthConnect';
import { syncHealthData } from './api';
import type { HealthPayload } from './api';

type SyncResult = { status: 'success'; hcFields: number } | { status: 'no-token' } | { status: 'error'; message: string };

const todayDate = (): string => new Date().toISOString().slice(0, 10);

const countFields = (p: HealthPayload): number =>
  Object.keys(p).filter(k => k !== 'date' && p[k as keyof HealthPayload] !== undefined).length;

export const runSync = async (): Promise<SyncResult> => {
  const token = await getToken();
  if (!token) return { status: 'no-token' };

  let payload: HealthPayload;
  let hcError: string | null = null;
  try {
    payload = await readYesterdayData();
  } catch (e: any) {
    hcError = e?.message ?? String(e);
    payload = { date: todayDate() };
  }

  try {
    await syncHealthData(token, payload);
    return { status: 'success', hcFields: countFields(payload), ...(hcError ? { hcError } : {}) } as any;
  } catch (e: any) {
    return { status: 'error', message: e?.message ?? String(e) };
  }
};
