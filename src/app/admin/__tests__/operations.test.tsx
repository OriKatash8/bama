import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import OperationsAdmin from '../operations';

let mockLang = 'en';
const mockPush = jest.fn();

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));

const E = en.admin_operations;
const H = he.admin_operations;

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
});

it('shows the title, the subtitle and the greeting header', () => {
  const r = render(<OperationsAdmin />);
  expect(r.getByText(E.title)).toBeTruthy();
  expect(r.getByText(E.greeting)).toBeTruthy();
  expect(r.getByText(`${en.admin_dashboard.greeting}, Dana`)).toBeTruthy();
  // A tab root: no back button.
  expect(r.queryByTestId('admin-back')).toBeNull();
});

it('lists the four operations pages in one card', () => {
  const r = render(<OperationsAdmin />);
  const card = within(r.getByTestId('ops-card'));
  for (const label of [E.courses, E.communities, E.marketplace, E.fees]) expect(card.getByText(label)).toBeTruthy();
});

it.each([
  ['courses', '/admin/courses'],
  ['communities', '/admin/communities'],
  ['marketplace', '/admin/marketplace'],
  ['fees', '/admin/fees'],
])('the %s row opens its page', (key, route) => {
  const r = render(<OperationsAdmin />);
  fireEvent.press(r.getByTestId(`ops-${key}`));
  expect(mockPush).toHaveBeenCalledWith(route);
});

it('mirrors in Hebrew: rows run right to left, text aligns right', () => {
  mockLang = 'he';
  const r = render(<OperationsAdmin />);
  const title = StyleSheet.flatten(r.getByText(H.title).props.style);
  expect(title.textAlign).toBe('right');
  expect(r.getByText(H.courses)).toBeTruthy();
  const row = StyleSheet.flatten(r.getByTestId('ops-courses').props.style);
  expect(row.flexDirection).toBe('row-reverse');
  expect(StyleSheet.flatten(r.getByTestId('dash-header-row').props.style).flexDirection).toBe('row-reverse');
});

it('rows run left to right in English', () => {
  const r = render(<OperationsAdmin />);
  expect(StyleSheet.flatten(r.getByTestId('ops-courses').props.style).flexDirection).toBe('row');
  expect(StyleSheet.flatten(r.getByText(E.title).props.style).textAlign).toBe('left');
});
