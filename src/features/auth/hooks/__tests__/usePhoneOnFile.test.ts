import { renderHook, act } from '@testing-library/react-native';
import { usePhoneOnFile } from '../usePhoneOnFile';
import { useAuthStore } from '@core/stores/authStore';

/**
 * The phone number is optional (App Store 5.1.1(v)), so this gates nothing: it
 * only keeps `hasPhone` live, so the setup form knows whether to offer the field.
 * Unknown — still loading, or the read failed — is null.
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

it('is unknown while still loading', () => {
  const { result } = renderHook(() => usePhoneOnFile());
  expect(result.current).toBeNull();
});

it('reports a user with no number', () => {
  const { result } = renderHook(() => usePhoneOnFile());
  act(() => mockEmit!(null));
  expect(result.current).toBe(false);
  expect(useAuthStore.getState().hasPhone).toBe(false);
});

it('follows a number being saved', () => {
  const { result } = renderHook(() => usePhoneOnFile());
  act(() => mockEmit!(null));
  expect(result.current).toBe(false);
  act(() => mockEmit!('+972501234567'));
  expect(result.current).toBe(true);
});

it('a failed read is unknown', () => {
  const { result } = renderHook(() => usePhoneOnFile());
  act(() => mockFail!(new Error('offline')));
  expect(result.current).toBeNull();
});

it('without a signed-in user there is nothing to read', () => {
  useAuthStore.setState({ user: null, hasPhone: null });
  const { result } = renderHook(() => usePhoneOnFile());
  expect(mockEmit).toBeNull();
  expect(result.current).toBeNull();
});

it('stops listening when unmounted', () => {
  const { unmount } = renderHook(() => usePhoneOnFile());
  unmount();
  expect(mockUnsub).toHaveBeenCalled();
});
