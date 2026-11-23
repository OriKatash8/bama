import { Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { signInWithCredential, signInWithPopup } from 'firebase/auth';
import { useGoogleSignIn } from '../useGoogleSignIn';
import { useAppleSignIn } from '../useAppleSignIn';
import { usePendingSignupStore } from '@features/auth/stores/pendingSignupStore';
import { syncUser } from '@features/auth/utils/syncUser';
import { recordConsent } from '@features/auth/utils/consent';
import { useUiStore } from '@core/stores/uiStore';
import i18n from '@core/i18n';

/**
 * Google sign-in (native + web): a NEW account goes through consent exactly
 * like Apple; an existing one signs in untouched. A different-provider email
 * clash shows the same clear message on native Google, web Google and Apple.
 */

const mockReplace = jest.fn();
let mockIsNew = true;
let mockLinked = true;
const mockRequired = jest.fn();
let mockConfigureArgs: unknown[] = [];

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(16)),
  digestStringAsync: jest.fn(async () => 'hashed'),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { HEX: 'hex' },
}));
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(async () => ({ identityToken: 'id-token', email: null, fullName: null })),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock('@features/auth/utils/googleNative', () => ({
  isGoogleNativeLinked: () => mockLinked,
  isGoogleSignInAvailable: () => mockLinked,
}));
jest.mock('@react-native-google-signin/google-signin', () => (mockRequired(), {
  GoogleSignin: {
    configure: (...a: unknown[]) => { mockConfigureArgs.push(a[0]); },
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({
      data: { idToken: 'g-token', user: { name: 'Noa Levi', email: 'noa@gmail.com', photo: null } },
    })),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));
jest.mock('firebase/auth', () => ({
  OAuthProvider: jest.fn().mockImplementation(() => ({ credential: jest.fn(() => ({})) })),
  GoogleAuthProvider: { credential: jest.fn(() => ({})) },
  signInWithCredential: jest.fn(),
  signInWithPopup: jest.fn(),
  getAdditionalUserInfo: jest.fn(() => ({ isNewUser: mockIsNew })),
}));
jest.mock('@core/firebase/config', () => ({ auth: {}, googleProvider: {} }));
jest.mock('@features/auth/utils/syncUser', () => ({ syncUser: jest.fn(async () => undefined) }));
jest.mock('@features/auth/utils/consent', () => ({ recordConsent: jest.fn(async () => ({})) }));

const setOS = (os: 'ios' | 'android' | 'web') => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
const realOS = Platform.OS;
const okUser = { user: { uid: 'g-uid', email: 'noa@gmail.com', displayName: 'Noa Levi', photoURL: null } };
const clash = Object.assign(new Error('clash'), { code: 'auth/account-exists-with-different-credential' });
const expected = () => i18n.t('auth.err_email_other_provider');

beforeEach(() => {
  jest.clearAllMocks();
  usePendingSignupStore.setState({ pending: null });
  useUiStore.setState({ toast: null } as never);
  (signInWithCredential as jest.Mock).mockResolvedValue(okUser);
  (signInWithPopup as jest.Mock).mockResolvedValue(okUser);
  mockLinked = true;
  setOS('ios');
});
afterAll(() => setOS(realOS as 'ios'));

describe.each([['native (android)', 'android'], ['native (ios)', 'ios'], ['web', 'web']] as const)('Google on %s', (_n, os) => {
  beforeEach(() => setOS(os));

  it('a new account goes to the consent screen with nothing written', async () => {
    mockIsNew = true;
    const { result } = renderHook(() => useGoogleSignIn());
    await act(async () => { await result.current.signInWithGoogle(); });
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/consent');
    expect(recordConsent).not.toHaveBeenCalled();
    expect(syncUser).not.toHaveBeenCalled();
    expect(usePendingSignupStore.getState().pending?.uid).toBe('g-uid');
  });

  it('register boxes ticked: consent recorded, no consent screen', async () => {
    mockIsNew = true;
    const { result } = renderHook(() => useGoogleSignIn());
    await act(async () => { await result.current.signInWithGoogle({ consented: true }); });
    expect(recordConsent).toHaveBeenCalledWith('g-uid');
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/mode-select');
    expect(mockReplace).not.toHaveBeenCalledWith('/(auth)/consent');
  });

  it('an existing account signs in, consent untouched', async () => {
    mockIsNew = false;
    const { result } = renderHook(() => useGoogleSignIn());
    await act(async () => { await result.current.signInWithGoogle(); });
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/mode-select');
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it('a different-provider email clash shows the clear message', async () => {
    (signInWithCredential as jest.Mock).mockRejectedValue(clash);
    (signInWithPopup as jest.Mock).mockRejectedValue(clash);
    const { result } = renderHook(() => useGoogleSignIn());
    await act(async () => { await result.current.signInWithGoogle(); });
    expect(result.current.error).toBe(expected());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

it('native Google is configured with the vnjr iOS client and the web client', async () => {
  setOS('ios');
  mockIsNew = false;
  const { result } = renderHook(() => useGoogleSignIn());
  await act(async () => { await result.current.signInWithGoogle(); });
  expect(mockConfigureArgs).toContainEqual({
    iosClientId: '165833515213-vnjr63akeo6tlrpr2a3i0q2ua742nj8f.apps.googleusercontent.com',
    webClientId: '165833515213-ne79l7lafiupu1gdvsubh6pjl7eogr7p.apps.googleusercontent.com',
  });
});

it('Apple: a different-provider email clash shows the same message', async () => {
  setOS('ios');
  (signInWithCredential as jest.Mock).mockRejectedValue(clash);
  const { result } = renderHook(() => useAppleSignIn());
  await act(async () => { await result.current.signInWithApple(); });
  expect(result.current.error).toBe(expected());
});

it('the message text is the agreed wording', () => {
  expect(i18n.t('auth.err_email_other_provider', { lng: 'en' })).toBe(
    'This email is already registered — sign in the way you signed up',
  );
  expect(i18n.t('auth.err_email_other_provider', { lng: 'he' })).toBe('האימייל הזה כבר רשום — התחבר בדרך שבה נרשמת');
});

describe('a build without the RNGoogleSignin native module', () => {
  it('never requires the package, never crashes, and shows the plain failure message', async () => {
    setOS('ios');
    mockLinked = false;
    mockRequired.mockClear();
    const { result } = renderHook(() => useGoogleSignIn());
    await act(async () => { await result.current.signInWithGoogle(); });
    expect(result.current.error).toBe(i18n.t('auth.err_google_failed'));
    expect(signInWithCredential).not.toHaveBeenCalled();
  });
});
