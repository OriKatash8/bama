import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';

/**
 * GOOGLE SIGN-IN IS ON (iOS, Android, web); APPLE STAYS iOS-ONLY.
 *
 * Login and register show the Google button everywhere, with Apple beside it
 * on iOS. The "or" divider and the social row always have a button under them.
 * The row still mirrors in Hebrew. With the flag off, Google disappears and a
 * lone divider is never left over an empty row.
 */

let mockLang = 'en';
let mockGoogleEnabled = true;

jest.mock('../GoogleSignInButton', () => {
  const { Text } = jest.requireActual('react-native');
  return { GoogleSignInButton: () => <Text testID="google-button">G</Text> };
});
jest.mock('../AppleSignInButton', () => {
  const { Text } = jest.requireActual('react-native');
  return { AppleSignInButton: () => <Text testID="apple-button">A</Text> };
});
jest.mock('../AuthSettingsButton', () => ({ AuthSettingsButton: () => null }));
let mockNativeLinked = true;
jest.mock('@features/auth/utils/googleNative', () => ({
  isGoogleSignInAvailable: () => {
    const { Platform: P } = jest.requireActual('react-native');
    return mockGoogleEnabled && (P.OS === 'web' || mockNativeLinked);
  },
}));
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

beforeEach(() => { mockLang = 'en'; mockGoogleEnabled = true; mockNativeLinked = true; setOS('ios'); });
afterAll(() => setOS(realOS as 'ios'));

describe.each([
  ['login', LoginForm],
  ['register', RegisterForm],
])('the %s screen', (_name, Form) => {
  it('on iPhone: the divider, then Google and Apple side by side', () => {
    const r = render(<Form />);
    expect(r.getByTestId('social-divider')).toBeTruthy();
    expect(r.getByText(en.auth.or)).toBeTruthy();
    expect(r.getByTestId('google-button')).toBeTruthy();
    expect(r.getByTestId('apple-button')).toBeTruthy();
    expect(r.getByTestId('social-row').children).toHaveLength(2);
  });

  it.each(['android', 'web'] as const)('on %s: Google alone, no Apple', (os) => {
    setOS(os);
    const r = render(<Form />);
    expect(r.getByTestId('social-divider')).toBeTruthy();
    expect(r.getByTestId('google-button')).toBeTruthy();
    expect(r.queryByTestId('apple-button')).toBeNull();
    expect(r.getByTestId('social-row').children).toHaveLength(1);
  });

  it('in Hebrew the row still mirrors', () => {
    mockLang = 'he';
    const r = render(<Form />);
    expect(StyleSheet.flatten(r.getByTestId('social-row').props.style).flexDirection).toBe('row-reverse');
    expect(StyleSheet.flatten(r.getByTestId('social-divider').props.style).flexDirection).toBe('row-reverse');
  });

  it('an older build without the native module: no Google button, Apple alone (iOS); web unaffected', () => {
    mockNativeLinked = false;
    const r = render(<Form />);
    expect(r.queryByTestId('google-button')).toBeNull();
    expect(r.getByTestId('apple-button')).toBeTruthy();
    expect(r.getByTestId('social-row').children).toHaveLength(1);
    setOS('android');
    const a = render(<Form />);
    expect(a.queryByTestId('social-divider')).toBeNull();
    setOS('web');
    expect(render(<Form />).getByTestId('google-button')).toBeTruthy();
  });

  it('with the flag off Google is gone; on android/web no divider over an empty row', () => {
    mockGoogleEnabled = false;
    setOS('android');
    const r = render(<Form />);
    expect(r.queryByTestId('google-button')).toBeNull();
    expect(r.queryByTestId('social-divider')).toBeNull();
    expect(r.queryByTestId('social-row')).toBeNull();
  });
});

describe('the register screen hands its ticked boxes to the social buttons', () => {
  it('tells the social buttons whether both boxes are ticked', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('node:path');
    const src: string = readFileSync(join(__dirname, '..', 'RegisterForm.tsx'), 'utf8');
    expect(src).toMatch(/<AppleSignInButton[^>]*consented=\{termsAccepted && ageConfirmed\}/);
    expect(src).toMatch(/<GoogleSignInButton[^>]*consented=\{termsAccepted && ageConfirmed\}/);
    // The login screen has no boxes: nothing to hand over there.
    const login: string = readFileSync(join(__dirname, '..', 'LoginForm.tsx'), 'utf8');
    expect(login).not.toMatch(/consented=/);
  });
});
