import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, within } from '@testing-library/react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { AppHeader } from '../AppHeader';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The settings drawer, redesigned: a compact profile row, rows grouped into
 * cards under small section titles, log out on its own card, delete account as
 * a small link in the footer next to the app version. Hebrew flips it the way
 * every other screen flips itself (the app forces LTR globally): icon at the
 * start, chevron at the end pointing forward. Targets are unchanged.
 */

const mockPush = jest.fn();
const mockLogout = jest.fn();
const mockState = { activeMode: 'professional' as 'professional' | 'client', language: 'en' as 'en' | 'he' };

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useSegments: () => [] }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '9.9.9' } } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: object) => unknown) =>
    s({ user: { id: 'u1', displayName: 'Pro Person', email: 'p@x.y' }, setUser: jest.fn(), activeMode: mockState.activeMode }),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: object) => unknown) => s({ language: mockState.language, setLanguage: jest.fn() }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: (s: (x: object) => unknown) => s({ isDark: false }) }));
jest.mock('@features/auth/hooks/useLogout', () => ({ useLogout: () => ({ logout: mockLogout }) }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({ updateDocument: jest.fn() }));
jest.mock('@features/auth/components/ModeSwitcherSheet', () => ({ ModeSwitcherSheet: () => null }));

beforeEach(() => { jest.clearAllMocks(); mockState.activeMode = 'professional'; mockState.language = 'en'; });

function open(mode: 'professional' | 'client' = 'professional', language: 'en' | 'he' = 'en') {
  mockState.activeMode = mode;
  mockState.language = language;
  const r = render(<AppHeader />);
  fireEvent.press(r.getByTestId('settings-gear'));
  return r;
}
const flat = (el: ReactTestInstance) => StyleSheet.flatten(el.props.style) as Record<string, unknown>;

describe('groups', () => {
  it.each(['en', 'he'] as const)('three titled cards in %s, each holding its rows', (lang) => {
    const tr = lang === 'he' ? he : en;
    const r = open('professional', lang);
    const card = (id: string) => within(r.getByTestId(`settings-card-${id}`));

    expect(card('preferences').getByText(tr.settings.section_preferences)).toBeTruthy();
    expect(card('preferences').getByText(tr.settings.language)).toBeTruthy();
    expect(card('preferences').getByText(tr.settings.notifications)).toBeTruthy();

    expect(card('account').getByText(tr.settings.section_account)).toBeTruthy();
    expect(card('account').getByText(tr.settings.phone)).toBeTruthy();
    expect(card('account').getByText(tr.settings.pricing)).toBeTruthy();
    expect(card('account').getByText(tr.balance.title)).toBeTruthy();

    expect(card('help').getByText(tr.settings.section_help)).toBeTruthy();
    expect(card('help').getByText(tr.settings.contact_us)).toBeTruthy();
    expect(card('help').getByText(tr.settings.information)).toBeTruthy();
  });

  it('the balance label is unchanged', () => {
    expect(he.balance.title).toBe('יתרת תיווך');
    expect(en.balance.title).toBe('Brokerage balance');
  });

  it('a client has no pricing or balance rows', () => {
    const r = open('client');
    const account = within(r.getByTestId('settings-card-account'));
    expect(account.getByText(en.settings.phone)).toBeTruthy();
    expect(account.queryByText(en.settings.pricing)).toBeNull();
    expect(account.queryByText(en.balance.title)).toBeNull();
  });

  it('every target is unchanged', () => {
    const r = open('professional');
    for (const [label, path] of [
      [en.settings.notifications, '/settings/notifications'],
      [en.settings.phone, '/settings/phone'],
      [en.settings.pricing, '/settings/pricing'],
      [en.balance.title, '/settings/payment'],
      [en.settings.contact_us, '/settings/contact'],
    ] as const) {
      fireEvent.press(open('professional').getByText(label));
      expect(mockPush).toHaveBeenLastCalledWith(path);
    }
    r.unmount();
  });
});

describe('profile row', () => {
  it('pro mode: avatar, name, email and an edit-profile link to the profile editor', () => {
    const r = open('professional');
    expect(r.getByText('Pro Person')).toBeTruthy();
    expect(r.getByText('p@x.y')).toBeTruthy();
    expect(r.getByTestId('settings-avatar')).toBeTruthy();
    expect(r.getByTestId('settings-camera-badge')).toBeTruthy();
    expect(r.getByTestId('settings-profile-chevron')).toBeTruthy();
    fireEvent.press(r.getByText(en.settings.edit_profile));
    expect(mockPush).toHaveBeenCalledWith('/(professional)/(tabs)/profile?edit=1');
  });

  it('the avatar is 52px', () => {
    const r = open('professional');
    expect(flat(r.getByTestId('settings-avatar'))).toEqual(expect.objectContaining({ width: 52, height: 52 }));
  });

  it('client mode: the row is static, no link and no chevron', () => {
    const r = open('client');
    expect(r.getByText('Pro Person')).toBeTruthy();
    expect(r.queryByText(en.settings.edit_profile)).toBeNull();
    expect(r.queryByTestId('settings-profile-chevron')).toBeNull();
  });
});

describe('Hebrew flips the drawer like every other screen', () => {
  it.each([['en', 'row', ChevronRight, ChevronLeft], ['he', 'row-reverse', ChevronLeft, ChevronRight]] as const)(
    '%s: rows run %s, the chevron points forward',
    (lang, dir, forward, backward) => {
      const tr = lang === 'he' ? he : en;
      const r = open('professional', lang);
      const row = r.getByTestId('settings-row-notifications');
      expect(flat(row).flexDirection).toBe(dir);
      expect(row.findAllByType(forward)).toHaveLength(1);
      expect(row.findAllByType(backward)).toHaveLength(0);
      expect(flat(within(row).getByText(tr.settings.notifications)).textAlign).toBe(lang === 'he' ? 'right' : 'left');
    },
  );

  it('section titles align to the start', () => {
    expect(flat(open('professional', 'he').getByText(he.settings.section_help)).textAlign).toBe('right');
  });
});

describe('log out and delete account', () => {
  it('log out is its own card, red', () => {
    const r = open();
    const card = within(r.getByTestId('settings-logout-card'));
    expect(flat(card.getByText(en.settings.logout)).color).toBe('#ff4d6d');
    fireEvent.press(card.getByText(en.settings.logout));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('delete account is a small muted underlined link in the footer, next to the version', () => {
    const r = open();
    const footer = within(r.getByTestId('settings-footer'));
    const link = footer.getByText(en.settings.delete_account);
    expect(flat(link).textDecorationLine).toBe('underline');
    expect(footer.getByText(`${en.settings.version} 9.9.9`)).toBeTruthy();
    fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith('/settings/delete-account');
  });

  it('delete account is no longer one of the rows', () => {
    const r = open();
    for (const id of ['preferences', 'account', 'help']) {
      expect(within(r.getByTestId(`settings-card-${id}`)).queryByText(en.settings.delete_account)).toBeNull();
    }
  });
});
