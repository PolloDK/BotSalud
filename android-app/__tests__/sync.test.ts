jest.mock('../src/services/healthConnect', () => ({
  readRecentDays: jest.fn(),
  todayLocalDate: jest.fn(() => '2026-08-24'),
  DAYS_TO_SYNC: 4,
  BACKFILL_DAYS: 35,
}));
jest.mock('../src/services/api', () => ({
  syncHealthData: jest.fn(),
}));
jest.mock('../src/storage', () => ({
  getToken: jest.fn(),
  isBackfillDone: jest.fn(() => Promise.resolve(true)),
  markBackfillDone: jest.fn(() => Promise.resolve()),
}));

import { runSync } from '../src/services/sync';
import { readRecentDays, DAYS_TO_SYNC, BACKFILL_DAYS } from '../src/services/healthConnect';
import { syncHealthData } from '../src/services/api';
import { getToken, isBackfillDone, markBackfillDone } from '../src/storage';

const mockRead = readRecentDays as jest.Mock;
const mockPost = syncHealthData as jest.Mock;
const mockGetToken = getToken as jest.Mock;
const mockBackfillDone = isBackfillDone as jest.Mock;
const mockMarkBackfill = markBackfillDone as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockBackfillDone.mockResolvedValue(true);
});

it('reads data and posts one payload per day when token exists', async () => {
  mockGetToken.mockResolvedValue('valid-token');
  mockRead.mockResolvedValue([
    { date: '2026-08-23', steps: 5000 },
    { date: '2026-08-24', weight_kg: 80.5 },
  ]);
  mockPost.mockResolvedValue(undefined);
  const result = await runSync();
  expect(result).toMatchObject({ status: 'success', hcFields: 2 });
  expect(mockPost).toHaveBeenCalledTimes(2);
  expect(mockPost).toHaveBeenNthCalledWith(1, 'valid-token', { date: '2026-08-23', steps: 5000 });
  expect(mockPost).toHaveBeenNthCalledWith(2, 'valid-token', { date: '2026-08-24', weight_kg: 80.5 });
});

it('returns no-token when token not set', async () => {
  mockGetToken.mockResolvedValue(null);
  const result = await runSync();
  expect(result).toMatchObject({ status: 'no-token' });
  expect(mockPost).not.toHaveBeenCalled();
});

it('returns error when API call fails', async () => {
  mockGetToken.mockResolvedValue('valid-token');
  mockRead.mockResolvedValue([{ date: '2026-08-24' }]);
  mockPost.mockRejectedValue(new Error('network error'));
  const result = await runSync();
  expect(result).toMatchObject({ status: 'error', message: 'network error' });
});

it('backfills the full window once then marks it done', async () => {
  mockGetToken.mockResolvedValue('valid-token');
  mockBackfillDone.mockResolvedValue(false);
  mockRead.mockResolvedValue([{ date: '2026-07-25', steps: 100 }]);
  mockPost.mockResolvedValue(undefined);
  await runSync();
  expect(mockRead).toHaveBeenCalledWith(BACKFILL_DAYS);
  expect(mockMarkBackfill).toHaveBeenCalledTimes(1);
});

it('uses the short rolling window once backfill is done', async () => {
  mockGetToken.mockResolvedValue('valid-token');
  mockBackfillDone.mockResolvedValue(true);
  mockRead.mockResolvedValue([{ date: '2026-08-24' }]);
  mockPost.mockResolvedValue(undefined);
  await runSync();
  expect(mockRead).toHaveBeenCalledWith(DAYS_TO_SYNC);
  expect(mockMarkBackfill).not.toHaveBeenCalled();
});
