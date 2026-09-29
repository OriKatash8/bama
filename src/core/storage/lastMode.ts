import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActiveMode } from '@core/types/user';

/**
 * The mode a user was last in, kept on this device per user, so a relaunch
 * reopens there instead of asking again at mode-select. Written by switchMode
 * (and a mode group opened directly), read by useAuth while auth is loading,
 * removed on sign-out.
 *
 * Never throws: an unreadable or unknown value is "no saved mode", which is
 * the old behaviour — mode-select.
 */
const key = (uid: string) => `bama:lastMode:${uid}`;

export async function readLastMode(uid: string): Promise<ActiveMode | null> {
  try {
    const v = await AsyncStorage.getItem(key(uid));
    return v === 'client' || v === 'professional' ? v : null;
  } catch {
    return null;
  }
}

export async function writeLastMode(uid: string, mode: ActiveMode): Promise<void> {
  try { await AsyncStorage.setItem(key(uid), mode); } catch { /* next launch asks again */ }
}

export async function clearLastMode(uid: string): Promise<void> {
  try { await AsyncStorage.removeItem(key(uid)); } catch { /* per-user key; harmless if left */ }
}
