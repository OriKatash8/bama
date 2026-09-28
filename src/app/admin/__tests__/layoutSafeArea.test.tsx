import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AdminTabsLayout from '../_layout';

/**
 * The layout once handed its pages `top: 0`, so every admin page drew its
 * header from y = 0, under the status bar and the Dynamic Island.
 */

jest.mock('expo-router', () => {
  const Probe = () => {
    const { top } = jest.requireActual('react-native-safe-area-context').useSafeAreaInsets();
    const { Text: T } = jest.requireActual('react-native');
    return <T testID="page-top">{String(top)}</T>;
  };
  const Tabs = () => <Probe />;
  const Screen = () => null;
  Tabs.Screen = Screen;
  return { Tabs, Redirect: () => null };
});
jest.mock('@core/hooks/useIsAdmin', () => ({ useIsAdmin: () => ({ isAdmin: true, loading: false }) }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: (s: (x: { isDark: boolean }) => unknown) => s({ isDark: false }) }));
jest.mock('@core/hooks/useAppFont', () => ({ useAppFont: () => ({ regular: {} }) }));
jest.mock('@features/auth/hooks/useLogout', () => ({ useLogout: () => ({ logout: jest.fn() }) }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/navigation/floatingTabBar', () => ({
  getFloatingTabBarStyle: () => ({}),
  FLOATING_TAB_BAR_ACTIVE_COLOR: 'x',
  FLOATING_TAB_BAR_INACTIVE_COLOR: { dark: 'x', light: 'x' },
}));
jest.mock('@features/admin/ui', () => ({
  useAdminPalette: () => ({ surface: 's', border: 'b', text2: 't' }),
  cardShadow: () => ({}),
}));

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } };

it('admin pages get the real top inset, so their header clears the status bar', () => {
  const r = render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AdminTabsLayout />
    </SafeAreaProvider>,
  );
  expect(r.getByTestId('page-top').props.children).toBe('62');
});

it('the log-out button sits below the status bar too', () => {
  const r = render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AdminTabsLayout />
    </SafeAreaProvider>,
  );
  const style = [r.getByTestId('admin-logout').props.style].flat(3).reduce((a, s) => ({ ...a, ...s }), {});
  expect(style.top).toBeGreaterThanOrEqual(62);
});
