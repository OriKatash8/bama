import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { setDoc } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import en from '@core/i18n/translations/en.json';
import { ConsentForm } from '../ConsentForm';
import { signOut } from '@core/firebase/auth';
import { syncUser } from '@features/auth/utils/syncUser';
import { usePendingSignupStore } from '@features/auth/stores/pendingSignupStore';
import { useAuthStore } from '@core/stores/authStore';
import { CURRENT_TERMS_VERSION } from '@core/constants/legal';

/**
 * The consent screen. Both boxes start unchecked; Continue writes the four
 * consent fields only once both are checked; Cancel removes a brand-new
 * account (or only signs an existing one out) and never writes consent.
 */

const mockReplace = jest.fn();
const mockDiscard = jest.fn(async (_data: unknown) => ({ discarded: true }));
const mockCurrentUser = { uid: 'new-uid' };

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@core/firebase/config', () => ({ get auth() { return { currentUser: mockCurrentUser }; }, db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn((_db, c, id) => `${c}/${id}`), setDoc: jest.fn(async () => undefined) }));
jest.mock('firebase/auth', () => ({ deleteUser: jest.fn(async () => undefined) }));
jest.mock('@core/firebase/functions', () => ({ callFunction: () => (d: unknown) => mockDiscard(d) }));
jest.mock('@core/firebase/auth', () => ({ signOut: jest.fn(async () => undefined) }));
jest.mock('@features/auth/utils/syncUser', () => ({ syncUser: jest.fn(async () => undefined) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
let mockLang = 'en';

const A = en.auth;
const PENDING = { uid: 'new-uid', email: 'n@x.com', displayName: 'Noa Levi', photoURL: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  usePendingSignupStore.setState({ pending: PENDING });
  useAuthStore.setState({ user: null });
});

const continueDisabled = (r: ReturnType<typeof render>) =>
  r.getByTestId('consent-continue').props.accessibilityState.disabled;

it('shows both boxes unchecked, with links to the documents, and Continue off', () => {
  const r = render(<ConsentForm />);
  expect(r.getByTestId('consent-terms').props.accessibilityState.checked).toBe(false);
  expect(r.getByTestId('consent-age').props.accessibilityState.checked).toBe(false);
  expect(r.getByText(A.terms_of_service)).toBeTruthy();
  expect(r.getByText(A.privacy_policy)).toBeTruthy();
  expect(continueDisabled(r)).toBe(true);
});

it('one box is not enough: nothing is written', async () => {
  const r = render(<ConsentForm />);
  fireEvent.press(r.getByTestId('consent-terms'));
  expect(continueDisabled(r)).toBe(true);
  await act(async () => { fireEvent.press(r.getByText(A.consent_continue)); });
  expect(setDoc).not.toHaveBeenCalled();
});

it('accepting writes all four consent fields, then the new profile, then moves on', async () => {
  // syncUser is mocked: stand in for the new profile it puts in the store.
  (syncUser as jest.Mock).mockImplementationOnce(async () => {
    useAuthStore.setState({ user: { id: 'new-uid', termsVersion: '1.0', needsProfileSetup: true } as never });
  });
  const r = render(<ConsentForm />);
  fireEvent.press(r.getByTestId('consent-terms'));
  fireEvent.press(r.getByTestId('consent-age'));
  expect(continueDisabled(r)).toBe(false);
  await act(async () => { fireEvent.press(r.getByText(A.consent_continue)); });

  expect(setDoc).toHaveBeenCalledTimes(1);
  const [ref, data, opts] = (setDoc as jest.Mock).mock.calls[0];
  expect(ref).toBe('users/new-uid');
  expect(opts).toEqual({ merge: true });
  expect(Object.keys(data).sort()).toEqual(['ageConfirmed', 'ageConfirmedAt', 'termsAcceptedAt', 'termsVersion']);
  expect(data.ageConfirmed).toBe(true);
  expect(data.termsVersion).toBe(CURRENT_TERMS_VERSION);
  expect(typeof data.termsAcceptedAt).toBe('number');
  expect(data.ageConfirmedAt).toBe(data.termsAcceptedAt);

  // A new account: flagged for the name / picture / phone page before mode select.
  expect(syncUser).toHaveBeenCalledWith('new-uid', PENDING, expect.any(Function), undefined, { newAccount: true });
  expect(usePendingSignupStore.getState().pending).toBeNull();
  // On to the name / picture page — never '/', which from inside (auth) is login.
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/setup');
});

it('an existing user re-accepting keeps their profile and gets the new version', async () => {
  usePendingSignupStore.setState({ pending: null });
  useAuthStore.setState({ user: { id: 'new-uid', displayName: 'Old', termsVersion: '0.9' } as never });
  const r = render(<ConsentForm />);
  fireEvent.press(r.getByTestId('consent-terms'));
  fireEvent.press(r.getByTestId('consent-age'));
  await act(async () => { fireEvent.press(r.getByText(A.consent_continue)); });

  expect(syncUser).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.termsVersion).toBe(CURRENT_TERMS_VERSION);
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/mode-select');
});

it('declining removes the new account on the server, signs out, and writes no consent', async () => {
  const r = render(<ConsentForm />);
  fireEvent.press(r.getByTestId('consent-terms'));
  await act(async () => { fireEvent.press(r.getByTestId('consent-decline')); });

  expect(mockDiscard).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalled();
  expect(setDoc).not.toHaveBeenCalled();
  expect(usePendingSignupStore.getState().pending).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith('/(auth)');
});

it('if the server cannot be reached, a just-created account still loses its Auth user', async () => {
  mockDiscard.mockRejectedValueOnce(new Error('unavailable'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const r = render(<ConsentForm />);
  await act(async () => { fireEvent.press(r.getByTestId('consent-decline')); });

  expect(deleteUser).toHaveBeenCalledWith(mockCurrentUser);
  expect(signOut).toHaveBeenCalled();
});

it('an existing account that declines is only signed out, never deleted from here', async () => {
  usePendingSignupStore.setState({ pending: null });
  mockDiscard.mockRejectedValueOnce(new Error('unavailable'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const r = render(<ConsentForm />);
  await act(async () => { fireEvent.press(r.getByTestId('consent-decline')); });

  expect(deleteUser).not.toHaveBeenCalled();
  expect(signOut).toHaveBeenCalled();
});

it('in Hebrew the boxes sit on the right', () => {
  mockLang = 'he';
  const r = render(<ConsentForm />);
  const flat = (id: string) => [r.getByTestId(id).props.style].flat(3).reduce((a, s) => ({ ...a, ...s }), {});
  expect(flat('consent-terms').flexDirection).toBe('row-reverse');
  expect(flat('consent-age').flexDirection).toBe('row-reverse');
});
