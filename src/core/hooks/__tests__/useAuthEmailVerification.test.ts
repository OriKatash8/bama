import { renderHook, act } from '@testing-library/react-native';
import { useAuth } from '../useAuth';
import { useAuthStore } from '@core/stores/authStore';

/**
 * The email-verification gate reads `needsEmailVerification` from the store, and
 * the store must follow the ID TOKEN, not just the auth state: verifying and
 * pressing "check again" reloads the user and refreshes the token, which fires
 * onIdTokenChanged but never onAuthStateChanged.
 */

let mockTokenListener: ((u: unknown) => void) | null = null;
jest.mock('@core/firebase/auth', () => ({
  onAuthChange: () => () => {},
  onTokenChange: (cb: (u: unknown) => void) => { mockTokenListener = cb; return () => {}; },
  signOut: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({ deleteField: jest.fn(), serverTimestamp: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({
  getDocument: jest.fn(), updateDocument: jest.fn(), setDocument: jest.fn(),
}));
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));
jest.mock('@core/notifications/registerForPushNotifications', () => ({ registerIfGranted: jest.fn() }));
jest.mock('@core/notifications/foregroundHandler', () => ({ handleForegroundNotification: jest.fn() }));
jest.mock('@core/i18n', () => ({ __esModule: true, default: { language: 'he' } }));

const user = (providerId: string, emailVerified: boolean) => ({ emailVerified, providerData: [{ providerId }] });

beforeEach(() => {
  mockTokenListener = null;
  useAuthStore.setState({ needsEmailVerification: null });
});

it('follows the token: unverified, then verified after "check again"', () => {
  renderHook(() => useAuth());
  act(() => mockTokenListener!(user('password', false)));
  expect(useAuthStore.getState().needsEmailVerification).toBe(true);

  act(() => mockTokenListener!(user('password', true)));
  expect(useAuthStore.getState().needsEmailVerification).toBe(false);
});

it('a Google account never needs it', () => {
  renderHook(() => useAuth());
  act(() => mockTokenListener!(user('google.com', false)));
  expect(useAuthStore.getState().needsEmailVerification).toBe(false);
});

it('signed out: unknown again', () => {
  renderHook(() => useAuth());
  act(() => mockTokenListener!(user('password', false)));
  act(() => mockTokenListener!(null));
  expect(useAuthStore.getState().needsEmailVerification).toBeNull();
});
