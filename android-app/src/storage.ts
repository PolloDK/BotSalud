import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@botsalud_token';

export const getToken = (): Promise<string | null> =>
  AsyncStorage.getItem(TOKEN_KEY);

export const saveToken = (token: string): Promise<void> =>
  AsyncStorage.setItem(TOKEN_KEY, token);

export const clearToken = (): Promise<void> =>
  AsyncStorage.removeItem(TOKEN_KEY);
