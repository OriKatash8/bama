import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { AppHeader } from '../AppHeader';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The Terms, the Privacy Policy and the Cancellation & Refund Policy open from
 * the settings menu, in the app's language. Apple requires the privacy policy to be reachable inside the app.
 * They sit inside "Information": tapping it opens the three rows under it.
 */

const mockLang = { language: 'en' as 'en' | 'he' };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useSegments: () => [] }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: object) => unknown) =>
    s({ user: { id: 'u1', displayName: 'Pro Person', email: 'p@x.y' }, setUser: jest.fn(), activeMode: 'client' }),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: object) => unknown) => s({ language: mockLang.language, setLanguage: jest.fn() }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: (s: (x: object) => unknown) => s({ isDark: false }) }));
jest.mock('@features/auth/hooks/useLogout', () => ({ useLogout: () => ({ logout: jest.fn() }) }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({ updateDocument: jest.fn() }));
jest.mock('@features/auth/components/ModeSwitcherSheet', () => ({ ModeSwitcherSheet: () => null }));

let openURL: jest.SpyInstance;
beforeEach(() => {
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => openURL.mockRestore());

function openSettings() {
  const r = render(<AppHeader />);
  fireEvent.press(r.getByTestId('settings-gear'));
  fireEvent.press(r.getByText(mockLang.language === 'he' ? he.settings.information : en.settings.information));
  return r;
}

it('the three policies are inside Information: hidden until it is tapped, and tapping again folds them away', () => {
  mockLang.language = 'en';
  const r = render(<AppHeader />);
  fireEvent.press(r.getByTestId('settings-gear'));
  expect(r.queryByText(en.settings.terms)).toBeNull();
  expect(r.queryByText(en.settings.privacy)).toBeNull();
  expect(r.queryByText(en.settings.refunds)).toBeNull();

  fireEvent.press(r.getByText(en.settings.information));
  expect(r.getByText(en.settings.terms)).toBeTruthy();
  expect(r.getByText(en.settings.privacy)).toBeTruthy();
  expect(r.getByText(en.settings.refunds)).toBeTruthy();

  fireEvent.press(r.getByText(en.settings.information));
  expect(r.queryByText(en.settings.terms)).toBeNull();
});

it('Information no longer shows a "Coming soon" alert', () => {
  mockLang.language = 'en';
  const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  const r = render(<AppHeader />);
  fireEvent.press(r.getByTestId('settings-gear'));
  fireEvent.press(r.getByText(en.settings.information));
  expect(alert).not.toHaveBeenCalled();
  alert.mockRestore();
});

it('in English the rows read Terms of Use / Privacy Policy / Cancellation & Refund Policy and open the English pages', () => {
  mockLang.language = 'en';
  const r = openSettings();
  fireEvent.press(r.getByText(en.settings.terms));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/en/terms');
  fireEvent.press(r.getByText(en.settings.privacy));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/en/privacy');
  expect(en.settings.terms).toBe('Terms of Use');
  expect(en.settings.privacy).toBe('Privacy Policy');
  fireEvent.press(r.getByText('Cancellation & Refund Policy'));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/en/refunds');
});

it('in Hebrew the rows read תקנון / מדיניות פרטיות / מדיניות ביטולים והחזרים and open the Hebrew pages', () => {
  mockLang.language = 'he';
  const r = openSettings();
  fireEvent.press(r.getByText('תקנון'));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/terms');
  fireEvent.press(r.getByText('מדיניות פרטיות'));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/privacy');
  expect(he.settings.terms).toBe('תקנון');
  fireEvent.press(r.getByText('מדיניות ביטולים והחזרים'));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/refunds');
});
