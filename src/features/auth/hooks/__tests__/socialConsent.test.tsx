import { act, renderHook } from '@testing-library/react-native';
import { useAppleSignIn } from '../useAppleSignIn';
import { usePendingSignupStore } from '@features/auth/stores/pendingSignupStore';
import { syncUser } from '@features/auth/utils/syncUser';

/**
 * A NEW account made with a social button sees the consent screen before its
 * profile is written, and no consent is recorded on its behalf. An existing
 * account signs in as before, its consent untouched.
 */

const mockReplace = jest.fn();
let mockIsNew = true;

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(16)),
  digestStringAsync: jest.fn(async () => 'hashed'),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { HEX: 'hex' },
}));
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(async () => ({
    identityToken: 'id-token',
    email: 'new@privaterelay.appleid.com',
    fullName: { givenName: 'Noa', familyName: 'Levi' },
  })),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock('firebase/auth', () => ({
  OAuthProvider: jest.fn().mockImplementation(() => ({ credential: jest.fn(() => ({})) })),
  signInWithCredential: jest.fn(async () => ({ user: { uid: 'apple-uid', email: null } })),
  getAdditionalUserInfo: jest.fn(() => ({ isNewUser: mockIsNew })),
}));
jest.mock('@core/firebase/config', () => ({ auth: {} }));
jest.mock('@features/auth/utils/syncUser', () => ({ syncUser: jest.fn(async () => undefined) }));

beforeEach(() => {
  jest.clearAllMocks();
  usePendingSignupStore.setState({ pending: null });
});

it('a new Apple account goes to the consent screen, and nothing is written for it', async () => {
  mockIsNew = true;
  const { result } = renderHook(() => useAppleSignIn());
  await act(async () => { await result.current.signInWithApple(); });

  expect(mockReplace).toHaveBeenCalledWith('/(auth)/consent');
  expect(syncUser).not.toHaveBeenCalled();
  // What Apple sent once is held for after consent.
  expect(usePendingSignupStore.getState().pending).toEqual({
    uid: 'apple-uid', email: 'new@privaterelay.appleid.com', displayName: 'Noa Levi', photoURL: null,
  });
});

it('an existing Apple account signs in as before, with no consent written for it', async () => {
  mockIsNew = false;
  const { result } = renderHook(() => useAppleSignIn());
  await act(async () => { await result.current.signInWithApple(); });

  expect(mockReplace).toHaveBeenCalledWith('/(auth)/mode-select');
  expect(syncUser).toHaveBeenCalledTimes(1);
  // Three arguments only: no terms object, so syncUser writes no consent.
  expect((syncUser as jest.Mock).mock.calls[0]).toHaveLength(3);
  expect(usePendingSignupStore.getState().pending).toBeNull();
});
