import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@botsalud_token';
const BACKFILL_KEY = '@botsalud_backfill_done';

export const getToken = (): Promise<string | null> =>
  AsyncStorage.getItem(TOKEN_KEY);

export const saveToken = (token: string): Promise<void> =>
  AsyncStorage.setItem(TOKEN_KEY, token);

export const clearToken = (): Promise<void> =>
  AsyncStorage.removeItem(TOKEN_KEY);

// One-time historical backfill flag: true once the initial ~month of data has synced.
export const isBackfillDone = async (): Promise<boolean> =>
  (await AsyncStorage.getItem(BACKFILL_KEY)) === '1';

export const markBackfillDone = (): Promise<void> =>
  AsyncStorage.setItem(BACKFILL_KEY, '1');
