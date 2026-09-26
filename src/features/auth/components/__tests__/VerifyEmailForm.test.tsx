import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { VerifyEmailForm } from '../VerifyEmailForm';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The verify-email screen: the address (left-to-right, even in Hebrew), what to
 * do, "check again", "send again" with its countdown, "change email address"
 * (sign out → register) and log out. Errors are inline text — Alert does nothing
 * on web.
 */

let mockHook = {
  state: 'idle', errorKey: null as string | null, cooldown: 0,
  resend: jest.fn(), checkVerified: jest.fn(async () => false),
};
jest.mock('@features/auth/hooks/useEmailVerification', () => ({ useEmailVerification: () => mockHook }));
const mockLogout = jest.fn();
jest.mock('@features/auth/hooks/useLogout', () => ({ useLogout: () => ({ isLoading: false, logout: mockLogout }) }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@core/firebase/config', () => ({ auth: { currentUser: { email: 'dana@example.com' } } }));
jest.mock('../AuthSettingsButton', () => ({ AuthSettingsButton: () => null }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
let mockLang = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

const ev = en.email_verification;

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockHook = { state: 'idle', errorKey: null, cooldown: 0, resend: jest.fn(), checkVerified: jest.fn(async () => false) };
});

it('shows the address, left-to-right even in Hebrew', () => {
  mockLang = 'he';
  const r = render(<VerifyEmailForm />);
  const email = r.getByText('dana@example.com');
  expect(StyleSheet.flatten(email.props.style).writingDirection).toBe('ltr');
  expect(r.getByText(he.email_verification.title)).toBeTruthy();
});

it('"check again" goes into the app once verified', async () => {
  mockHook.checkVerified = jest.fn(async () => true);
  const r = render(<VerifyEmailForm />);
  await act(async () => { fireEvent.press(r.getByText(ev.check_again)); });
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('a quiet poll that verifies also goes in', () => {
  mockHook.state = 'verified';
  render(<VerifyEmailForm />);
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('"not yet" and failures show as inline text', () => {
  mockHook.errorKey = 'email_verification.not_yet';
  expect(render(<VerifyEmailForm />).getByText(ev.not_yet)).toBeTruthy();
  mockHook.errorKey = 'email_verification.err_too_many';
  expect(render(<VerifyEmailForm />).getByText(ev.err_too_many)).toBeTruthy();
});

it('"send again" sends, and counts down while cooling off', async () => {
  const r = render(<VerifyEmailForm />);
  await act(async () => { fireEvent.press(r.getByText(ev.resend)); });
  expect(mockHook.resend).toHaveBeenCalled();

  mockHook.cooldown = 42;
  const cooling = render(<VerifyEmailForm />);
  expect(cooling.getByText('Send again in 42s')).toBeTruthy();
  expect(cooling.queryByText(ev.resend)).toBeNull();
});

it('confirms a sent link inline', () => {
  mockHook.state = 'sent';
  expect(render(<VerifyEmailForm />).getByText(ev.sent_ok)).toBeTruthy();
});

it('"change email address" signs out to registration; log out signs out to the start', async () => {
  const r = render(<VerifyEmailForm />);
  await act(async () => { fireEvent.press(r.getByText(ev.change_email)); });
  expect(mockLogout).toHaveBeenCalledWith('/(auth)/register');
  await act(async () => { fireEvent.press(r.getByText(ev.logout)); });
  expect(mockLogout).toHaveBeenLastCalledWith();
});
