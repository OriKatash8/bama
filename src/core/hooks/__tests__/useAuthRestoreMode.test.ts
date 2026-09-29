import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../useAuth';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument } from '@core/firebase/firestore';

/**
 * A relaunch reopens in the user's last mode. The saved mode is read while auth
 * is still loading, so the root never shows mode-select for a moment first.
 */

let mockAuthListener: ((u: unknown) => Promise<void> | void) | null = null;
jest.mock('@core/firebase/auth', () => ({
  onAuthChange: (cb: (u: unknown) => void) => { mockAuthListener = cb; return () => {}; },
  onTokenChange: () => () => {},
  signOut: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({ deleteField: jest.fn(), serverTimestamp: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({
  getDocument: jest.fn(), updateDocument: jest.fn(), setDocument: jest.fn(),
}));
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));
jest.mock('@core/notifications/registerForPushNotifications', () => ({ registerIfGranted: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@core/notifications/foregroundHandler', () => ({ handleForegroundNotification: jest.fn() }));
jest.mock('@core/i18n', () => ({ __esModule: true, default: { language: 'he' } }));
jest.mock('@features/blocking/services/blockService', () => ({
  subscribeBlocks: jest.fn(() => jest.fn()),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockGetDocument = getDocument as jest.Mock;
const userDoc = { id: 'u1', termsVersion: '1.0' };

function docs(profile: unknown) {
  mockGetDocument.mockImplementation((path: string) => {
    if (path === 'users/u1') return Promise.resolve(userDoc);
    if (path === 'users/u1/profile/data') return profile instanceof Promise ? profile : Promise.resolve(profile);
    return Promise.resolve(null);
  });
}

async function signInAs(uid = 'u1') {
  renderHook(() => useAuth());
  await act(async () => { await mockAuthListener!({ uid, email: 'a@b.c' }); });
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockAuthListener = null;
  await AsyncStorage.clear();
  useAuthStore.setState({ user: null, activeMode: null, isLoading: true, proProfileCompleted: null });
});

it('restores a saved client mode before loading ends', async () => {
  await AsyncStorage.setItem('bama:lastMode:u1', 'client');
  docs(null);
  const seen: Array<[boolean, string | null]> = [];
  const unsub = useAuthStore.subscribe((s) => seen.push([s.isLoading, s.activeMode]));
  await signInAs();
  unsub();
  expect(useAuthStore.getState().activeMode).toBe('client');
  expect(useAuthStore.getState().isLoading).toBe(false);
  // Never "loaded with no mode" on the way: that is the mode-select flash.
  expect(seen.some(([loading, mode]) => !loading && mode === null)).toBe(false);
  expect(mockGetDocument).not.toHaveBeenCalledWith('users/u1/profile/data');
});

it('restores professional and reads whether the profile is complete', async () => {
  await AsyncStorage.setItem('bama:lastMode:u1', 'professional');
  docs({ proProfileCompleted: false });
  await signInAs();
  expect(useAuthStore.getState().activeMode).toBe('professional');
  expect(useAuthStore.getState().proProfileCompleted).toBe(false);
});

it('no saved mode: stays null (→ mode-select)', async () => {
  docs(null);
  await signInAs();
  expect(useAuthStore.getState().activeMode).toBeNull();
  expect(useAuthStore.getState().isLoading).toBe(false);
});

it('an invalid saved value: stays null (→ mode-select)', async () => {
  await AsyncStorage.setItem('bama:lastMode:u1', 'admin');
  docs(null);
  await signInAs();
  expect(useAuthStore.getState().activeMode).toBeNull();
});

it('offline: a profile read that never answers gives up after ~3s, leaves the lock unknown, and still loads', async () => {
  jest.useFakeTimers();
  await AsyncStorage.setItem('bama:lastMode:u1', 'professional');
  docs(new Promise(() => {}));
  renderHook(() => useAuth());
  let done = false;
  act(() => { void Promise.resolve(mockAuthListener!({ uid: 'u1', email: 'a@b.c' })).then(() => { done = true; }); });
  await act(async () => { await jest.advanceTimersByTimeAsync(3100); });
  expect(done).toBe(true);
  expect(useAuthStore.getState().isLoading).toBe(false);
  expect(useAuthStore.getState().activeMode).toBe('professional');
  expect(useAuthStore.getState().proProfileCompleted).toBeNull();
});

it('a failed profile read leaves the lock unknown and still restores the mode', async () => {
  await AsyncStorage.setItem('bama:lastMode:u1', 'professional');
  docs(Promise.reject(new Error('offline')));
  await signInAs();
  expect(useAuthStore.getState().activeMode).toBe('professional');
  expect(useAuthStore.getState().proProfileCompleted).toBeNull();
  expect(useAuthStore.getState().isLoading).toBe(false);
});

it('signed out while the saved mode was being read: the stale mode is not applied', async () => {
  await AsyncStorage.setItem('bama:lastMode:u1', 'client');
  docs(null);
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const realGet = AsyncStorage.getItem;
  (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async (k: string) => { await gate; return realGet(k); });
  renderHook(() => useAuth());
  let signIn!: Promise<void>;
  await act(async () => { signIn = Promise.resolve(mockAuthListener!({ uid: 'u1', email: 'a@b.c' })) as Promise<void>; });
  await act(async () => { await mockAuthListener!(null); });
  await act(async () => { release(); await signIn; });
  expect(useAuthStore.getState().user).toBeNull();
  expect(useAuthStore.getState().activeMode).toBeNull();
});

it('signing out forgets the previous user\'s saved mode', async () => {
  await AsyncStorage.setItem('bama:lastMode:u1', 'client');
  await AsyncStorage.setItem('bama:lastMode:u2', 'professional');
  docs(null);
  await signInAs();
  await act(async () => { await mockAuthListener!(null); });
  expect(await AsyncStorage.getItem('bama:lastMode:u1')).toBeNull();
  expect(await AsyncStorage.getItem('bama:lastMode:u2')).toBe('professional');
  expect(useAuthStore.getState().activeMode).toBeNull();
});
