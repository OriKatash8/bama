import AsyncStorage from '@react-native-async-storage/async-storage';
import { readLastMode, writeLastMode, clearLastMode } from '../lastMode';

/**
 * The mode a user was last in, per user, so a relaunch reopens there instead of
 * asking again. Anything unreadable counts as "no saved mode" → mode-select.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); });

it('round-trips a mode under bama:lastMode:{uid}', async () => {
  await writeLastMode('u1', 'professional');
  expect(await AsyncStorage.getItem('bama:lastMode:u1')).toBe('professional');
  expect(await readLastMode('u1')).toBe('professional');
});

it('is per user: another uid has nothing saved', async () => {
  await writeLastMode('u1', 'client');
  expect(await readLastMode('u2')).toBeNull();
});

it('clear removes only that user\'s key', async () => {
  await writeLastMode('u1', 'client');
  await writeLastMode('u2', 'professional');
  await clearLastMode('u1');
  expect(await readLastMode('u1')).toBeNull();
  expect(await readLastMode('u2')).toBe('professional');
});

it.each(['admin', '', 'CLIENT', '"client"'])('an unknown value (%j) reads as no saved mode', async (v) => {
  await AsyncStorage.setItem('bama:lastMode:u1', v);
  expect(await readLastMode('u1')).toBeNull();
});

it('a storage failure reads as no saved mode and never throws', async () => {
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
  await expect(readLastMode('u1')).resolves.toBeNull();
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
  await expect(writeLastMode('u1', 'client')).resolves.toBeUndefined();
  (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
  await expect(clearLastMode('u1')).resolves.toBeUndefined();
});
