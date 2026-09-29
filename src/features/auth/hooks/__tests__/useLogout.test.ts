import { renderHook, act } from '@testing-library/react-native';
import { useLogout } from '../useLogout';
import { signOut } from '@core/firebase/auth';
import { usePendingIntentStore } from '@core/stores/pendingIntentStore';
import { useAuthStore } from '@core/stores/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A saved deep link belongs to whoever tapped it. On a shared device, logging
 * out must not leave it for the next account to land on after their sign-in.
 */

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@core/firebase/auth', () => ({ signOut: jest.fn(() => Promise.resolve()) }));
jest.mock('@core/firebase/firestore', () => ({ deleteDocument: jest.fn() }));
jest.mock('@core/notifications/registerForPushNotifications', () => ({ getCachedPushToken: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(() => {
  jest.clearAllMocks();
  usePendingIntentStore.setState({ resume: null, afterProfile: null });
});

it('forgets any saved deep link and pending join on logout', async () => {
  usePendingIntentStore.getState().saveResume('/c/K7MX9P');
  usePendingIntentStore.getState().saveAfterProfile({ action: 'requestJoin', token: 'K7MX9P' });
  const { result } = renderHook(() => useLogout());
  await act(async () => { await result.current.logout(); });
  expect(signOut).toHaveBeenCalled();
  expect(usePendingIntentStore.getState().resume).toBeNull();
  expect(usePendingIntentStore.getState().afterProfile).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith('/(auth)');
});

it('forgets this user\'s last mode, so the next sign-in starts at mode-select', async () => {
  useAuthStore.setState({ user: { id: 'u1' } as never });
  await AsyncStorage.setItem('bama:lastMode:u1', 'professional');
  await AsyncStorage.setItem('bama:lastMode:u2', 'client');
  const { result } = renderHook(() => useLogout());
  await act(async () => { await result.current.logout(); });
  expect(await AsyncStorage.getItem('bama:lastMode:u1')).toBeNull();
  expect(await AsyncStorage.getItem('bama:lastMode:u2')).toBe('client');
});
