import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AppHeader } from '../AppHeader';
import en from '@core/i18n/translations/en.json';

/**
 * A professional's BAMA balance opens from the settings menu. It used to be a
 * button on each project's page; there it only appeared while that project had
 * fee business open. Here it is always one tap away, for professionals only:
 * a client is never charged a commission.
 */

const mockPush = jest.fn();
const mockMode = { activeMode: 'professional' as 'professional' | 'client' };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: object) => unknown) =>
    s({ user: { id: 'u1', displayName: 'Pro Person', email: 'p@x.y' }, setUser: jest.fn(), activeMode: mockMode.activeMode }),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: object) => unknown) => s({ language: 'en', setLanguage: jest.fn() }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: (s: (x: object) => unknown) => s({ isDark: false }) }));
jest.mock('@features/auth/hooks/useLogout', () => ({ useLogout: () => ({ logout: jest.fn() }) }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({ updateDocument: jest.fn() }));
jest.mock('@features/auth/components/ModeSwitcherSheet', () => ({ ModeSwitcherSheet: () => null }));

beforeEach(() => jest.clearAllMocks());

function openSettings() {
  const r = render(<AppHeader />);
  fireEvent.press(r.getByTestId('settings-gear'));
  return r;
}

it('a professional has a BAMA balance row that opens the balance screen', () => {
  mockMode.activeMode = 'professional';
  const r = openSettings();
  fireEvent.press(r.getByText(en.balance.title));
  expect(mockPush).toHaveBeenCalledWith('/settings/payment');
});

it('a client has no balance row', () => {
  mockMode.activeMode = 'client';
  const r = openSettings();
  expect(r.getByText(en.settings.notifications)).toBeTruthy(); // the menu really is open
  expect(r.queryByText(en.balance.title)).toBeNull();
});
