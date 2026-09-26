import { renderHook, act } from '@testing-library/react-native';
import { useEmailVerification } from '../useEmailVerification';

/**
 * The verify-email screen's logic. resend() has a 60s cooldown and never shows a
 * raw Firebase code; checkVerified() reloads the user and REFRESHES THE TOKEN
 * (so rules and the gate see email_verified), in that order; while the screen is
 * focused it polls every 5s and stops once verified or unmounted.
 */

const mockUser = {
  emailVerified: false,
  reload: jest.fn(async () => {}),
  getIdToken: jest.fn(async () => 'tok'),
};
jest.mock('@core/firebase/config', () => ({ auth: { get currentUser() { return mockUser; } } }));
const mockSend = jest.fn();
jest.mock('@core/firebase/auth', () => ({ sendVerificationEmail: (...a: unknown[]) => mockSend(...a) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUser.emailVerified = false;
  // clearAllMocks keeps implementations; a test that marks the user verified
  // on reload must not leak into the next.
  mockUser.reload.mockImplementation(async () => {});
  mockUser.getIdToken.mockImplementation(async () => 'tok');
  mockSend.mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());

describe('resend', () => {
  it('sends, reports sent, and starts a 60s cooldown that counts down', async () => {
    const { result } = renderHook(() => useEmailVerification());
    await act(async () => { await result.current.resend(); });
    expect(mockSend).toHaveBeenCalledWith(mockUser);
    expect(result.current.state).toBe('sent');
    expect(result.current.cooldown).toBe(60);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.cooldown).toBe(59);
  });

  it('does not send again during the cooldown', async () => {
    const { result } = renderHook(() => useEmailVerification());
    await act(async () => { await result.current.resend(); });
    await act(async () => { await result.current.resend(); });
    expect(mockSend).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(result.current.cooldown).toBe(0);
    await act(async () => { await result.current.resend(); });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('too many requests becomes a friendly message, never the raw code', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('Firebase: Error (auth/too-many-requests).'), { code: 'auth/too-many-requests' }));
    const { result } = renderHook(() => useEmailVerification());
    await act(async () => { await result.current.resend(); });
    expect(result.current.state).toBe('error');
    expect(result.current.errorKey).toBe('email_verification.err_too_many');
    expect(JSON.stringify(result.current)).not.toMatch(/auth\//);
  });

  it('any other failure gets the generic message', async () => {
    mockSend.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/network-request-failed' }));
    const { result } = renderHook(() => useEmailVerification());
    await act(async () => { await result.current.resend(); });
    expect(result.current.errorKey).toBe('email_verification.err_generic');
  });
});

describe('checkVerified', () => {
  it('reloads the user, THEN refreshes the token, and reports the result', async () => {
    const order: string[] = [];
    mockUser.reload.mockImplementation(async () => { order.push('reload'); mockUser.emailVerified = true; });
    mockUser.getIdToken.mockImplementation(async () => { order.push('token'); return 'tok'; });
    const { result } = renderHook(() => useEmailVerification({ poll: false }));
    let verified = false;
    await act(async () => { verified = await result.current.checkVerified(); });
    expect(order).toEqual(['reload', 'token']);
    expect(mockUser.getIdToken).toHaveBeenCalledWith(true);
    expect(verified).toBe(true);
    expect(result.current.state).toBe('verified');
  });

  it('still unverified: says so and stays', async () => {
    const { result } = renderHook(() => useEmailVerification({ poll: false }));
    let verified = true;
    await act(async () => { verified = await result.current.checkVerified(); });
    expect(verified).toBe(false);
    expect(result.current.state).toBe('idle');
    expect(result.current.errorKey).toBe('email_verification.not_yet');
  });
});

describe('polling while focused', () => {
  it('checks every 5s, and stops once verified', async () => {
    renderHook(() => useEmailVerification());
    act(() => { jest.advanceTimersByTime(5000); });
    await flush();
    expect(mockUser.reload).toHaveBeenCalledTimes(1);

    mockUser.reload.mockImplementation(async () => { mockUser.emailVerified = true; });
    act(() => { jest.advanceTimersByTime(5000); });
    await flush();
    expect(mockUser.reload).toHaveBeenCalledTimes(2);

    act(() => { jest.advanceTimersByTime(20_000); });
    await flush();
    expect(mockUser.reload).toHaveBeenCalledTimes(2);
  });

  it('stops when unmounted', async () => {
    const { unmount } = renderHook(() => useEmailVerification());
    unmount();
    act(() => { jest.advanceTimersByTime(20_000); });
    await flush();
    expect(mockUser.reload).not.toHaveBeenCalled();
  });

  it('a quiet poll does not show "not yet" — only a tapped check does', async () => {
    const { result } = renderHook(() => useEmailVerification());
    act(() => { jest.advanceTimersByTime(5000); });
    await flush();
    expect(result.current.errorKey).toBeNull();
  });
});
