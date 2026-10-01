import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { AppHeader } from '../AppHeader';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The Terms and the Privacy Policy open from the settings menu, in the app's
 * language. Apple requires the privacy policy to be reachable inside the app.
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
  return r;
}

it('in English the rows read Terms of Use / Privacy Policy and open the English pages', () => {
  mockLang.language = 'en';
  const r = openSettings();
  fireEvent.press(r.getByText(en.settings.terms));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/en/terms');
  fireEvent.press(r.getByText(en.settings.privacy));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/en/privacy');
  expect(en.settings.terms).toBe('Terms of Use');
  expect(en.settings.privacy).toBe('Privacy Policy');
});

it('in Hebrew the rows read תקנון / מדיניות פרטיות and open the Hebrew pages', () => {
  mockLang.language = 'he';
  const r = openSettings();
  fireEvent.press(r.getByText('תקנון'));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/terms');
  fireEvent.press(r.getByText('מדיניות פרטיות'));
  expect(openURL).toHaveBeenLastCalledWith('https://bama-af0a0.web.app/privacy');
  expect(he.settings.terms).toBe('תקנון');
});
