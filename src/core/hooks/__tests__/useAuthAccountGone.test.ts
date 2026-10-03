import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../useAuth';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument } from '@core/firebase/firestore';
import { signOut } from '@core/firebase/auth';

/**
 * A device still signed in as an account that no longer exists (deleted by an
 * admin, a wipe, or from another device) is signed out on open, so it lands on
 * login — it used to open onto mode select and a nameless home screen.
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
  subscribeToDocument: jest.fn(() => jest.fn()),
}));
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));
jest.mock('@core/notifications/registerForPushNotifications', () => ({ registerIfGranted: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@core/notifications/foregroundHandler', () => ({ handleForegroundNotification: jest.fn() }));
jest.mock('@core/i18n', () => ({ __esModule: true, default: { language: 'he' } }));
jest.mock('@features/blocking/services/blockService', () => ({ subscribeBlocks: jest.fn(() => jest.fn()) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockGetDocument = getDocument as jest.Mock;
const mockSignOut = signOut as jest.Mock;
const fail = (code: string) => () => Promise.reject(Object.assign(new Error(code), { code }));

async function openAppAs(firebaseUser: Record<string, unknown>) {
  renderHook(() => useAuth());
  await act(async () => { await mockAuthListener!(firebaseUser); });
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuthListener = null;
  await AsyncStorage.clear();
  useAuthStore.setState({ user: null, activeMode: null, isLoading: true, proProfileCompleted: null });
});

it('an account deleted on the server is signed out — even with no user doc left', async () => {
  mockGetDocument.mockResolvedValue(null);
  await openAppAs({ uid: 'gone', email: 'g@x.y', reload: fail('auth/user-not-found') });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().user).toBeNull();
});

it('a revoked or expired session is signed out too', async () => {
  mockGetDocument.mockResolvedValue({ id: 'u1', termsVersion: '1.4' });
  await openAppAs({ uid: 'u1', email: 'a@b.c', reload: fail('auth/user-token-expired') });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().user).toBeNull();
});

it('offline is not "gone": the user stays signed in', async () => {
  mockGetDocument.mockResolvedValue({ id: 'u1', termsVersion: '1.4' });
  await openAppAs({ uid: 'u1', email: 'a@b.c', reload: fail('auth/network-request-failed') });
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.id).toBe('u1');
});

it('a suspension (disabled account) is left to the moderation flow, not signed out here', async () => {
  mockGetDocument.mockResolvedValue({ id: 'u1', termsVersion: '1.4' });
  await openAppAs({ uid: 'u1', email: 'a@b.c', reload: fail('auth/user-disabled') });
  expect(mockSignOut).not.toHaveBeenCalled();
});

it('a live account opens normally', async () => {
  mockGetDocument.mockResolvedValue({ id: 'u1', termsVersion: '1.4' });
  await openAppAs({ uid: 'u1', email: 'a@b.c', reload: () => Promise.resolve() });
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.id).toBe('u1');
});
