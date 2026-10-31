import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { render } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AdminText } from '@features/communityAdmin/components/primitives';
import { AdminPage } from '../AdminPage';

/**
 * A form on an admin page (Rental companies) must not sit behind the phone
 * keyboard: with `keyboardAware` the page shrinks above it, as Screen does, and a
 * drag closes it. Every other admin page, and web, stays exactly as it was.
 */

jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));

const page = (keyboardAware?: boolean) => (
  <AdminPage title="Rental companies" keyboardAware={keyboardAware}>
    <AdminText>body</AdminText>
  </AdminPage>
);

const realOS = Platform.OS;
afterEach(() => { Platform.OS = realOS; });

it.each(['ios', 'android'] as const)('%s: keyboardAware wraps the page so the keyboard never covers the form', (os) => {
  Platform.OS = os;
  const r = render(page(true));
  expect(r.getByTestId('admin-page-keyboard')).toBeTruthy();
  expect(r.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe(os === 'ios' ? 'padding' : 'height');
  expect(r.UNSAFE_getByType(ScrollView).props.keyboardDismissMode).toBe('on-drag');
  expect(r.getByText('body')).toBeTruthy();
});

it('without it, the page is exactly as before', () => {
  const r = render(page());
  expect(r.queryByTestId('admin-page-keyboard')).toBeNull();
  expect(r.UNSAFE_getByType(ScrollView).props.keyboardDismissMode).toBeUndefined();
});

it('web: no keyboard wrapper', () => {
  Platform.OS = 'web' as never;
  const r = render(page(true));
  expect(r.queryByTestId('admin-page-keyboard')).toBeNull();
});

it('the Rental companies page turns it on', () => {
  const src = readFileSync(join(__dirname, '../../../../app/admin/rental-companies.tsx'), 'utf8');
  expect(src).toMatch(/<AdminPage[\s\S]*?keyboardAware[\s\S]*?>/);
});
