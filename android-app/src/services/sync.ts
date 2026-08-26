import { getToken } from '../storage';
import { readRecentDays, todayLocalDate } from './healthConnect';
import { syncHealthData } from './api';
import type { HealthPayload } from './api';

type SyncResult = { status: 'success'; hcFields: number } | { status: 'no-token' } | { status: 'error'; message: string };

const countFields = (p: HealthPayload): number =>
  Object.keys(p).filter(k => k !== 'date' && p[k as keyof HealthPayload] !== undefined).length;

export const runSync = async (): Promise<SyncResult> => {
  const token = await getToken();
  if (!token) return { status: 'no-token' };

  let payloads: HealthPayload[];
  let hcError: string | null = null;
  try {
    payloads = await readRecentDays();
  } catch (e: any) {
    hcError = e?.message ?? String(e);
    payloads = [{ date: todayLocalDate() }];
  }

  try {
    // One row per day — the backend upserts on (user_id, date), never accumulates.
    for (const payload of payloads) {
      await syncHealthData(token, payload);
    }
    const hcFields = payloads.reduce((acc, p) => acc + countFields(p), 0);
    return { status: 'success', hcFields, ...(hcError ? { hcError } : {}) } as any;
  } catch (e: any) {
    return { status: 'error', message: e?.message ?? String(e) };
  }
};
