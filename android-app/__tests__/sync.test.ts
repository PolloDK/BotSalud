jest.mock('../src/services/healthConnect', () => ({
  readRecentDays: jest.fn(),
  todayLocalDate: jest.fn(() => '2026-08-24'),
  DAYS_TO_SYNC: 4,
  BACKFILL_DAYS: 35,
  BACKFILL_VERSION: 2,
}));
jest.mock('../src/services/api', () => ({
  syncHealthData: jest.fn(),
}));
jest.mock('../src/storage', () => ({
  getToken: jest.fn(),
  getBackfillVersion: jest.fn(() => Promise.resolve(2)),
  setBackfillVersion: jest.fn(() => Promise.resolve()),
}));

import { runSync } from '../src/services/sync';
import { readRecentDays, DAYS_TO_SYNC, BACKFILL_DAYS } from '../src/services/healthConnect';
import { syncHealthData } from '../src/services/api';
import { getToken, getBackfillVersion, setBackfillVersion } from '../src/storage';

const mockRead = readRecentDays as jest.Mock;
const mockPost = syncHealthData as jest.Mock;
const mockGetToken = getToken as jest.Mock;
const mockBackfillVersion = getBackfillVersion as jest.Mock;
const mockSetBackfill = setBackfillVersion as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockBackfillVersion.mockResolvedValue(2); // backfill already at current version
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

it('re-backfills the full window when stored version is behind, then records version', async () => {
  mockGetToken.mockResolvedValue('valid-token');
  mockBackfillVersion.mockResolvedValue(1); // older than current (2) -> re-backfill
  mockRead.mockResolvedValue([{ date: '2026-07-25', steps: 100 }]);
  mockPost.mockResolvedValue(undefined);
  await runSync();
  expect(mockRead).toHaveBeenCalledWith(BACKFILL_DAYS);
  expect(mockSetBackfill).toHaveBeenCalledWith(2);
});

it('uses the short rolling window once backfill version is current', async () => {
  mockGetToken.mockResolvedValue('valid-token');
  mockBackfillVersion.mockResolvedValue(2);
  mockRead.mockResolvedValue([{ date: '2026-08-24' }]);
  mockPost.mockResolvedValue(undefined);
  await runSync();
  expect(mockRead).toHaveBeenCalledWith(DAYS_TO_SYNC);
  expect(mockSetBackfill).not.toHaveBeenCalled();
});
