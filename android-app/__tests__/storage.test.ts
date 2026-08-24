import { getToken, saveToken, clearToken } from '../src/storage';

beforeEach(() => {
  jest.clearAllMocks();
});

it('returns null when no token stored', async () => {
  const result = await getToken();
  expect(result).toBeNull();
});

it('saves and retrieves token', async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  AsyncStorage.getItem.mockResolvedValueOnce('my-secret-token');
  const result = await getToken();
  expect(result).toBe('my-secret-token');
});

it('saveToken calls setItem with correct key', async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await saveToken('abc-123');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('@botsalud_token', 'abc-123');
});

it('clearToken calls removeItem', async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await clearToken();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@botsalud_token');
});
