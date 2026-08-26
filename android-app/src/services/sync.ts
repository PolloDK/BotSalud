import { getToken, getBackfillVersion, setBackfillVersion } from '../storage';
import { readRecentDays, todayLocalDate, DAYS_TO_SYNC, BACKFILL_DAYS, BACKFILL_VERSION } from './healthConnect';
import { syncHealthData } from './api';
import type { HealthPayload } from './api';

type SyncResult = { status: 'success'; hcFields: number } | { status: 'no-token' } | { status: 'error'; message: string };

const countFields = (p: HealthPayload): number =>
  Object.keys(p).filter(k => k !== 'date' && p[k as keyof HealthPayload] !== undefined).length;

export const runSync = async (): Promise<SyncResult> => {
  const token = await getToken();
  if (!token) return { status: 'no-token' };

  // Re-backfill ~a month whenever the backfill version advances (e.g. dedup fix);
  // afterwards only a short rolling window.
  const backfillDone = (await getBackfillVersion()) >= BACKFILL_VERSION;
  const numDays = backfillDone ? DAYS_TO_SYNC : BACKFILL_DAYS;

  let payloads: HealthPayload[];
  let hcError: string | null = null;
  try {
    payloads = await readRecentDays(numDays);
  } catch (e: any) {
    hcError = e?.message ?? String(e);
    payloads = [{ date: todayLocalDate() }];
  }

  try {
    // One row per day — the backend upserts on (user_id, date), never accumulates.
    for (const payload of payloads) {
      await syncHealthData(token, payload);
    }
    // Only record the backfill version once every day posted successfully.
    if (!backfillDone && !hcError) await setBackfillVersion(BACKFILL_VERSION);
    const hcFields = payloads.reduce((acc, p) => acc + countFields(p), 0);
    return { status: 'success', hcFields, ...(hcError ? { hcError } : {}) } as any;
  } catch (e: any) {
    return { status: 'error', message: e?.message ?? String(e) };
  }
};
