jest.mock('../src/services/healthConnect', () => ({
  readRecentDays: jest.fn(),
  todayLocalDate: jest.fn(() => '2026-08-24'),
}));
jest.mock('../src/services/api', () => ({
  syncHealthData: jest.fn(),
}));
jest.mock('../src/storage', () => ({
  getToken: jest.fn(),
}));

import { runSync } from '../src/services/sync';
import { readRecentDays } from '../src/services/healthConnect';
import { syncHealthData } from '../src/services/api';
import { getToken } from '../src/storage';

const mockRead = readRecentDays as jest.Mock;
const mockPost = syncHealthData as jest.Mock;
const mockGetToken = getToken as jest.Mock;

beforeEach(() => jest.clearAllMocks());

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
