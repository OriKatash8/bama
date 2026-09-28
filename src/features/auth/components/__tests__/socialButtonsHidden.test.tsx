import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';

/**
 * GOOGLE SIGN-IN IS OFF FOR V1, AND NOTHING IS LEFT BEHIND.
 *
 * Login and register show no Google button while GOOGLE_SIGNIN_ENABLED is
 * false. The "or" divider and the social row appear only when a button will
 * actually show under them (Apple, on iOS) — never a lone divider over an
 * empty row. The row still mirrors in Hebrew.
 */

let mockLang = 'en';
let mockGoogleEnabled = false;

jest.mock('../GoogleSignInButton', () => {
  const { Text } = jest.requireActual('react-native');
  return { GoogleSignInButton: () => <Text testID="google-button">G</Text> };
});
jest.mock('../AppleSignInButton', () => {
  const { Text } = jest.requireActual('react-native');
  return { AppleSignInButton: () => <Text testID="apple-button">A</Text> };
});
jest.mock('../AuthSettingsButton', () => ({ AuthSettingsButton: () => null }));
jest.mock('@core/constants/auth', () => ({ get GOOGLE_SIGNIN_ENABLED() { return mockGoogleEnabled; } }));
jest.mock('@features/auth/hooks/useLogin', () => ({ useLogin: () => ({ isLoading: false, error: null, login: jest.fn() }) }));
jest.mock('@features/auth/hooks/useRegister', () => ({ useRegister: () => ({ isLoading: false, error: null, register: jest.fn() }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LoginForm } = require('../LoginForm');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RegisterForm } = require('../RegisterForm');

const setOS = (os: 'ios' | 'android' | 'web') => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
const realOS = Platform.OS;

beforeEach(() => { mockLang = 'en'; mockGoogleEnabled = false; setOS('ios'); });
afterAll(() => setOS(realOS as 'ios'));

describe.each([
  ['login', LoginForm],
  ['register', RegisterForm],
])('the %s screen', (_name, Form) => {
  it('shows no Google button', () => {
    const r = render(<Form />);
    expect(r.queryByTestId('google-button')).toBeNull();
  });

  it('on iPhone: the divider, then Apple alone in the row', () => {
    const r = render(<Form />);
    expect(r.getByTestId('social-divider')).toBeTruthy();
    expect(r.getByText(en.auth.or)).toBeTruthy();
    expect(r.getByTestId('apple-button')).toBeTruthy();
    expect(r.getByTestId('social-row').children).toHaveLength(1);
  });

  it.each(['android', 'web'] as const)('on %s (no Apple): no divider and no empty row', (os) => {
    setOS(os);
    const r = render(<Form />);
    expect(r.queryByTestId('social-divider')).toBeNull();
    expect(r.queryByTestId('social-row')).toBeNull();
    expect(r.queryByText(en.auth.or)).toBeNull();
  });

  it('in Hebrew the row still mirrors', () => {
    mockLang = 'he';
    const r = render(<Form />);
    expect(StyleSheet.flatten(r.getByTestId('social-row').props.style).flexDirection).toBe('row-reverse');
    expect(StyleSheet.flatten(r.getByTestId('social-divider').props.style).flexDirection).toBe('row-reverse');
  });

  it('turning the flag back on brings Google back beside Apple', () => {
    mockGoogleEnabled = true;
    const r = render(<Form />);
    expect(r.getByTestId('google-button')).toBeTruthy();
    expect(r.getByTestId('social-row').children).toHaveLength(2);
  });
});
