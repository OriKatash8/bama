import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../useAuth';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument, updateDocument } from '@core/firebase/firestore';
import { useModerationStore } from '@core/stores/moderationStore';

/**
 * An admin's warning is shown once. After the user acknowledges it, signing in
 * again (later, or on another device) goes straight in — until a NEW warning,
 * which has its own actionId and shows once more. A suspension still always
 * shows and signs the user out.
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
jest.mock('@features/blocking/services/blockService', () => ({
  subscribeBlocks: jest.fn(() => jest.fn()),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockGetDocument = getDocument as jest.Mock;
const WARNING = { status: 'warned', reason: 'Spam in chats', actionId: 'act-1' };

function userIs(doc: Record<string, unknown>) {
  mockGetDocument.mockImplementation((path: string) =>
    Promise.resolve(path === 'users/u1' ? { id: 'u1', termsVersion: '1.0', ...doc } : null));
}

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

it('a warning not yet acknowledged shows on sign-in, carrying its id', async () => {
  userIs({ moderation: WARNING });
  await signIn();
  expect(useModerationStore.getState().notice).toEqual({ status: 'warned', reason: 'Spam in chats', actionId: 'act-1' });
});

it('an acknowledged warning does not show again', async () => {
  userIs({ moderation: WARNING, moderationAckId: 'act-1' });
  await signIn();
  expect(useModerationStore.getState().notice).toBeNull();
  expect(useAuthStore.getState().user).not.toBeNull(); // still let in
});

it('a NEW warning shows once even after an older one was acknowledged', async () => {
  userIs({ moderation: { ...WARNING, actionId: 'act-2', reason: 'Again' }, moderationAckId: 'act-1' });
  await signIn();
  expect(useModerationStore.getState().notice).toEqual({ status: 'warned', reason: 'Again', actionId: 'act-2' });
});

it('a suspension always shows, whatever was acknowledged', async () => {
  userIs({ moderation: { ...WARNING, status: 'suspended' }, moderationAckId: 'act-1' });
  await signIn();
  expect(useModerationStore.getState().notice?.status).toBe('suspended');
});

it('acknowledging saves the warning id on the user, so it is not shown again', async () => {
  useAuthStore.setState({ user: { id: 'u1' } as never });
  useModerationStore.setState({ notice: { status: 'warned', reason: 'x', actionId: 'act-1' } });
  await act(async () => { await useModerationStore.getState().acknowledge(); });
  expect(updateDocument).toHaveBeenCalledWith('users/u1', { moderationAckId: 'act-1' });
  expect(useModerationStore.getState().notice).toBeNull();
});

it('acknowledging closes the notice even if saving fails (it shows again next time)', async () => {
  (updateDocument as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  useAuthStore.setState({ user: { id: 'u1' } as never });
  useModerationStore.setState({ notice: { status: 'warned', reason: 'x', actionId: 'act-1' } });
  await act(async () => { await useModerationStore.getState().acknowledge(); });
  expect(useModerationStore.getState().notice).toBeNull();
});

it('dismissing a suspension notice saves nothing', async () => {
  useAuthStore.setState({ user: null });
  useModerationStore.setState({ notice: { status: 'suspended', reason: 'x', actionId: 'act-1' } });
  await act(async () => { await useModerationStore.getState().acknowledge(); });
  expect(updateDocument).not.toHaveBeenCalled();
  expect(useModerationStore.getState().notice).toBeNull();
});
