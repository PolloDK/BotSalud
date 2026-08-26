import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@botsalud_token';
const BACKFILL_VERSION_KEY = '@botsalud_backfill_version';

export const getToken = (): Promise<string | null> =>
  AsyncStorage.getItem(TOKEN_KEY);

export const saveToken = (token: string): Promise<void> =>
  AsyncStorage.setItem(TOKEN_KEY, token);

export const clearToken = (): Promise<void> =>
  AsyncStorage.removeItem(TOKEN_KEY);

// Historical-backfill version already applied on this device (0 = never).
// Bumping BACKFILL_VERSION in code forces a one-time re-backfill so past rows
// are rewritten when the aggregation logic changes.
export const getBackfillVersion = async (): Promise<number> =>
  parseInt((await AsyncStorage.getItem(BACKFILL_VERSION_KEY)) ?? '0', 10) || 0;

export const setBackfillVersion = (v: number): Promise<void> =>
  AsyncStorage.setItem(BACKFILL_VERSION_KEY, String(v));
