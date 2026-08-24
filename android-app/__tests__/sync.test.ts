jest.mock('../src/services/healthConnect', () => ({
  readYesterdayData: jest.fn(),
}));
jest.mock('../src/services/api', () => ({
  syncHealthData: jest.fn(),
}));
jest.mock('../src/storage', () => ({
  getToken: jest.fn(),
}));

import { runSync } from '../src/services/sync';
import { readYesterdayData } from '../src/services/healthConnect';
import { syncHealthData } from '../src/services/api';
import { getToken } from '../src/storage';

const mockRead = readYesterdayData as jest.Mock;
const mockPost = syncHealthData as jest.Mock;
const mockGetToken = getToken as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it('reads data and posts when token exists', async () => {
  mockGetToken.mockResolvedValue('valid-token');
  mockRead.mockResolvedValue({ date: '2026-08-24', weight_kg: 80.5 });
  mockPost.mockResolvedValue(undefined);
  const result = await runSync();
  expect(result).toBe('success');
  expect(mockPost).toHaveBeenCalledWith('valid-token', { date: '2026-08-24', weight_kg: 80.5 });
});

it('returns no-token when token not set', async () => {
  mockGetToken.mockResolvedValue(null);
  const result = await runSync();
  expect(result).toBe('no-token');
  expect(mockPost).not.toHaveBeenCalled();
});

it('returns error when API call fails', async () => {
  mockGetToken.mockResolvedValue('valid-token');
  mockRead.mockResolvedValue({ date: '2026-08-24' });
  mockPost.mockRejectedValue(new Error('network error'));
  const result = await runSync();
  expect(result).toBe('error');
});
