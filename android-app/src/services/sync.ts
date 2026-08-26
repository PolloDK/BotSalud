import { getToken, getBackfillVersion, setBackfillVersion } from '../storage';
import { readRecentDays, todayLocalDate, DAYS_TO_SYNC, BACKFILL_DAYS, BACKFILL_VERSION } from './healthConnect';
import { syncHealthData } from './api';
import type { HealthPayload } from './api';

type SyncResult =
  | { status: 'success'; hcFields: number; daysPosted: number; daysFailed: number }
  | { status: 'no-token' }
  | { status: 'error'; message: string };

const countFields = (p: HealthPayload): number =>
  Object.keys(p).filter(k => k !== 'date' && p[k as keyof HealthPayload] !== undefined).length;

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

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

  // Post NEWEST day first so the most relevant data lands even if older days fail,
  // and post each day independently — one failed day must not abort the rest.
  // (Backend upserts on (user_id, date), so retries are idempotent.)
  const ordered = [...payloads].reverse();
  let posted = 0;
  let failed = 0;
  let lastErr = '';
  for (let i = 0; i < ordered.length; i++) {
    try {
      await syncHealthData(token, ordered[i]);
      posted++;
    } catch (e: any) {
      failed++;
      lastErr = e?.message ?? String(e);
    }
    if (i < ordered.length - 1) await sleep(200); // ease load on the backend
  }

  if (posted === 0) {
    return { status: 'error', message: lastErr || 'network error' };
  }
  // Record the backfill version only when the WHOLE window posted cleanly, so a
  // partial backfill retries (re-reads all days) on the next sync until complete.
  if (!backfillDone && failed === 0 && !hcError) await setBackfillVersion(BACKFILL_VERSION);

  const hcFields = payloads.reduce((acc, p) => acc + countFields(p), 0);
  return { status: 'success', hcFields, daysPosted: posted, daysFailed: failed };
};
