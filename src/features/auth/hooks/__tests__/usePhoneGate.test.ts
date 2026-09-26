import { renderHook, act } from '@testing-library/react-native';
import { usePhoneGate } from '../usePhoneGate';
import { useAuthStore } from '@core/stores/authStore';

/**
 * The phone number is required, and some users never saw the registration form
 * (Google/Apple sign-in, accounts from before it existed). The gate: anyone
 * signed in without a number is sent to enter one. While it is still unknown —
 * or the read failed — nobody is locked out.
 */

let mockEmit: ((phone: string | null) => void) | null = null;
let mockFail: ((e: unknown) => void) | null = null;
const mockUnsub = jest.fn();
jest.mock('@features/auth/services/phoneService', () => ({
  subscribePhone: (_uid: string, cb: (p: string | null) => void, onErr: (e: unknown) => void) => {
    mockEmit = cb; mockFail = onErr; return mockUnsub;
  },
}));

beforeEach(() => {
  mockEmit = null; mockFail = null; mockUnsub.mockClear();
  useAuthStore.setState({ user: { id: 'u1' } as never, hasPhone: null });
});

it('does not gate while it is still unknown', () => {
  const { result } = renderHook(() => usePhoneGate());
  expect(result.current).toBe(false);
});

it('gates a user with no number', () => {
  const { result } = renderHook(() => usePhoneGate());
  act(() => mockEmit!(null));
  expect(result.current).toBe(true);
  expect(useAuthStore.getState().hasPhone).toBe(false);
});

it('lets a user with a number through, and lifts the gate once one is saved', () => {
  const { result } = renderHook(() => usePhoneGate());
  act(() => mockEmit!(null));
  expect(result.current).toBe(true);
  act(() => mockEmit!('+972501234567'));
  expect(result.current).toBe(false);
});

it('a failed read never locks anyone out', () => {
  const { result } = renderHook(() => usePhoneGate());
  act(() => mockFail!(new Error('offline')));
  expect(result.current).toBe(false);
});

it('without a signed-in user there is nothing to gate or read', () => {
  useAuthStore.setState({ user: null, hasPhone: null });
  const { result } = renderHook(() => usePhoneGate());
  expect(mockEmit).toBeNull();
  expect(result.current).toBe(false);
});

it('stops listening when unmounted', () => {
  const { unmount } = renderHook(() => usePhoneGate());
  unmount();
  expect(mockUnsub).toHaveBeenCalled();
});
