import axios from 'axios';
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

import { syncHealthData } from '../src/services/api';

it('posts to correct endpoint with bearer token', async () => {
  mockedAxios.post.mockResolvedValueOnce({ data: { status: 'ok' } });
  await syncHealthData('my-token', { date: '2026-08-24', weight_kg: 80.5 });
  expect(mockedAxios.post).toHaveBeenCalledWith(
    'https://botsalud-production.up.railway.app/sync',
    { date: '2026-08-24', weight_kg: 80.5 },
    { headers: { Authorization: 'Bearer my-token' } }
  );
});

it('throws on non-2xx response', async () => {
  mockedAxios.post.mockRejectedValueOnce({ response: { status: 401 } });
  await expect(
    syncHealthData('bad-token', { date: '2026-08-24' })
  ).rejects.toBeDefined();
});
