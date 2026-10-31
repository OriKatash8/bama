import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../useAuth';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument } from '@core/firebase/firestore';
import { recordLaunch } from '@core/services/recordLaunch';
import { useModerationStore } from '@core/stores/moderationStore';

/**
 * Once per launch with a signed-in user, the app stamps users/{uid} with its
 * platform, version and time (recordLaunch). Only for a user whose doc exists
 * and who is not suspended — a suspended user is signed out, a brand-new
 * social sign-up has no doc yet.
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
jest.mock('@core/services/recordLaunch', () => ({ recordLaunch: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));
jest.mock('@core/notifications/registerForPushNotifications', () => ({ registerIfGranted: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@core/notifications/foregroundHandler', () => ({ handleForegroundNotification: jest.fn() }));
jest.mock('@core/i18n', () => ({ __esModule: true, default: { language: 'he' } }));
jest.mock('@features/blocking/services/blockService', () => ({ subscribeBlocks: jest.fn(() => jest.fn()) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockGetDocument = getDocument as jest.Mock;

async function signIn() {
  renderHook(() => useAuth());
  await act(async () => { await mockAuthListener!({ uid: 'u1', email: 'a@b.c' }); });
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockAuthListener = null;
  await AsyncStorage.clear();
  useModerationStore.setState({ notice: null });
  useAuthStore.setState({ user: null, activeMode: null, isLoading: true, proProfileCompleted: null });
});

it('stamps the user doc once on a normal sign-in', async () => {
  mockGetDocument.mockImplementation((path: string) => Promise.resolve(path === 'users/u1' ? { id: 'u1', termsVersion: '1.0' } : null));
  await signIn();
  expect(recordLaunch).toHaveBeenCalledTimes(1);
  expect(recordLaunch).toHaveBeenCalledWith('u1');
});

it('still stamps a warned user (they are let in)', async () => {
  mockGetDocument.mockImplementation((path: string) =>
    Promise.resolve(path === 'users/u1' ? { id: 'u1', termsVersion: '1.0', moderation: { status: 'warned', reason: 'x', actionId: 'a' } } : null));
  await signIn();
  expect(recordLaunch).toHaveBeenCalledTimes(1);
});

it('does not stamp a suspended user (they are signed out)', async () => {
  mockGetDocument.mockImplementation((path: string) =>
    Promise.resolve(path === 'users/u1' ? { id: 'u1', moderation: { status: 'suspended', reason: 'x', actionId: 'a' } } : null));
  await signIn();
  expect(recordLaunch).not.toHaveBeenCalled();
});

it('does not stamp a sign-up whose user doc does not exist yet', async () => {
  mockGetDocument.mockResolvedValue(null);
  await signIn();
  expect(recordLaunch).not.toHaveBeenCalled();
});
