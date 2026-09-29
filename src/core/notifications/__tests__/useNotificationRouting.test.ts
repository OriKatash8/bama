import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useNotificationRouting } from '../useNotificationRouting';
import { useAuthStore } from '@core/stores/authStore';
import { useLaunchIntentStore } from '@core/stores/launchIntentStore';

/**
 * A notification tap that launched the app takes priority over the saved mode's
 * home, and lands with ONE navigation — no mode-home replace racing it.
 */

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(() => Promise.resolve({ proProfileCompleted: true })) }));
let mockTapListener: ((r: unknown) => void) | null = null;
jest.mock('expo-notifications', () => ({
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn((cb: (r: unknown) => void) => { mockTapListener = cb; return { remove: jest.fn() }; }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockGetLast = Notifications.getLastNotificationResponse as jest.Mock;
const tap = (id: string, data: object) => ({ notification: { request: { identifier: id, content: { data } } } });
const signedIn = { user: { id: 'u1', termsVersion: '1.0' } as never, isLoading: false, needsEmailVerification: false };

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockTapListener = null;
  mockGetLast.mockReturnValue(null);
  await AsyncStorage.clear();
  useLaunchIntentStore.setState({ checked: false, hasPending: false });
  useAuthStore.setState({ ...signedIn, activeMode: 'client' });
});

it('no launch notification → the launch check is done with nothing pending', () => {
  renderHook(() => useNotificationRouting());
  expect(useLaunchIntentStore.getState()).toMatchObject({ checked: true, hasPending: false });
});

it('the launch read throws → still marked checked, nothing pending (the root never waits forever)', () => {
  mockGetLast.mockImplementation(() => { throw new Error('unavailable'); });
  renderHook(() => useNotificationRouting());
  expect(useLaunchIntentStore.getState()).toMatchObject({ checked: true, hasPending: false });
});

it('cold start from a message tap, restored client → replaces straight to the chat', async () => {
  mockGetLast.mockReturnValue(tap('n1', { type: 'message', chatId: 'c1' }));
  renderHook(() => useNotificationRouting());
  await flush();
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/(client)/chat/c1');
  expect(mockPush).not.toHaveBeenCalled();
  expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  expect(useLaunchIntentStore.getState().hasPending).toBe(false);
});

it('cold start into the other mode → one navigation to the target; mode switched and saved', async () => {
  mockGetLast.mockReturnValue(tap('n2', { type: 'purchase', listingId: 'L1' }));
  renderHook(() => useNotificationRouting());
  await flush();
  expect(useAuthStore.getState().activeMode).toBe('professional');
  expect(await AsyncStorage.getItem('bama:lastMode:u1')).toBe('professional');
  expect(mockReplace.mock.calls).toEqual([['/(professional)/(tabs)/marketplace?listingId=L1']]);
  expect(mockPush).not.toHaveBeenCalled();
});

it('while it is pending the root is told to hold off', () => {
  useAuthStore.setState({ isLoading: true });
  mockGetLast.mockReturnValue(tap('n3', { type: 'message', chatId: 'c1' }));
  renderHook(() => useNotificationRouting());
  expect(useLaunchIntentStore.getState()).toMatchObject({ checked: true, hasPending: true });
  expect(mockReplace).not.toHaveBeenCalled();
});

it('waits behind the terms gate: nothing routes until consent is given', async () => {
  useAuthStore.setState({ user: { id: 'u1', termsVersion: '0.9' } as never });
  mockGetLast.mockReturnValue(tap('n4', { type: 'message', chatId: 'c1' }));
  renderHook(() => useNotificationRouting());
  await flush();
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => { useAuthStore.setState({ user: { id: 'u1', termsVersion: '1.0' } as never }); });
  await flush();
  expect(mockReplace).toHaveBeenCalledWith('/(client)/chat/c1');
});

it('a launch tap with nothing to open releases the root to go home', async () => {
  mockGetLast.mockReturnValue(tap('n5', { type: 'unknown' }));
  renderHook(() => useNotificationRouting());
  await flush();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(useLaunchIntentStore.getState().hasPending).toBe(false);
});

it('a tap while the app is open, same mode → pushes (Back returns to where the user was)', async () => {
  renderHook(() => useNotificationRouting());
  await act(async () => { mockTapListener!(tap('n6', { type: 'message', chatId: 'c9' })); });
  await flush();
  expect(mockPush).toHaveBeenCalledWith('/(client)/chat/c9');
  expect(mockReplace).not.toHaveBeenCalled();
});

it('the launch tap arriving again through the listener is handled once', async () => {
  const r = tap('n7', { type: 'message', chatId: 'c1' });
  mockGetLast.mockReturnValue(r);
  renderHook(() => useNotificationRouting());
  await act(async () => { mockTapListener!(r); });
  await flush();
  expect(mockReplace.mock.calls.length + mockPush.mock.calls.length).toBe(1);
});
