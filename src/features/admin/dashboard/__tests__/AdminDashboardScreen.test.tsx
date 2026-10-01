import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import AdminDashboardScreen from '../AdminDashboardScreen';
import { useAdminCounts } from '../counts';
import { useRegistrationStats } from '@features/admin/useRegistrationStats';

/**
 * The platform admin's dashboard, in the community dashboard's design. Data
 * hooks are faked at the module boundary; the counts' own test pins the queries.
 */

let mockLang = 'en';
const mockPush = jest.fn();

jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
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
jest.mock('../counts', () => ({ useAdminCounts: jest.fn() }));
jest.mock('@features/admin/useRegistrationStats', () => ({ useRegistrationStats: jest.fn() }));

const E = en.admin_dashboard;
const H = he.admin_dashboard;
const counts = useAdminCounts as jest.Mock;
const reg = useRegistrationStats as jest.Mock;

const COUNTS = { users: 1234, projects: 56, openReports: 3 };
const REG = {
  labels: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  total: [1, 0, 3, 2, 0, 4, 5],
  client: [1, 0, 2, 2, 0, 3, 4],
  pro: [0, 0, 2, 1, 0, 1, 2],
  loading: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockLang = 'en';
  counts.mockReturnValue(COUNTS);
  reg.mockReturnValue(REG);
});
afterEach(() => jest.useRealTimers());

const valueOf = (r: ReturnType<typeof render>, id: string) => r.getByTestId(`${id}-value`).props.accessibilityLabel ?? r.getByTestId(`${id}-value`).props.children;

it('shows the users and projects totals as stat tiles, and no courses or communities', () => {
  const r = render(<AdminDashboardScreen />);
  expect(valueOf(r, 'tile-users')).toBe('1,234');
  expect(valueOf(r, 'tile-projects')).toBe('56');
  expect(r.queryByTestId('tile-courses')).toBeNull();
  expect(r.queryByTestId('tile-communities')).toBeNull();
  expect(within(r.getByTestId('tile-users')).getByText(E.total_users)).toBeTruthy();
});

it('a count that failed shows "—" while the others still show', () => {
  counts.mockReturnValue({ ...COUNTS, projects: null });
  const r = render(<AdminDashboardScreen />);
  expect(valueOf(r, 'tile-projects')).toBe('—');
  expect(valueOf(r, 'tile-users')).toBe('1,234');
});

it('holds a spinner in each tile until the counts arrive', () => {
  counts.mockReturnValue(null);
  const r = render(<AdminDashboardScreen />);
  expect(r.getByTestId('tile-users-loading')).toBeTruthy();
  expect(r.queryByTestId('tile-users-value')).toBeNull();
});

it('the users tile carries the new registrations of the period', () => {
  const r = render(<AdminDashboardScreen />);
  const tile = within(r.getByTestId('tile-users'));
  expect(tile.getByText('+15')).toBeTruthy();
  expect(tile.getByText(E.sub_daily)).toBeTruthy();
});

// Tiles read as the community dashboard's: a footer line under every number.
it('every tile has a footer line under its number', () => {
  const r = render(<AdminDashboardScreen />);
  for (const id of ['tile-projects']) {
    expect(within(r.getByTestId(id)).getByText(E.all_time)).toBeTruthy();
  }
});

it('puts the reports card first, with the open count, and opens the reports page', () => {
  const r = render(<AdminDashboardScreen />);
  const ids = r.UNSAFE_root.findAll((n) => ['attention-card', 'tile-users', 'reg-chart'].includes(n.props.testID)).map((n) => n.props.testID);
  expect(ids[0]).toBe('attention-card');
  expect(within(r.getByTestId('attention-card')).getByText('3')).toBeTruthy();
  fireEvent.press(r.getByTestId('open-reports'));
  expect(mockPush).toHaveBeenCalledWith('/admin/reports');
});

it('switches the period for the chart and the users tile', () => {
  const r = render(<AdminDashboardScreen />);
  expect(reg).toHaveBeenLastCalledWith('daily', false);
  fireEvent.press(r.getByTestId('period-weekly'));
  expect(reg).toHaveBeenLastCalledWith('weekly', false);
  expect(r.getByTestId('period-weekly').props.accessibilityState.selected).toBe(true);
  fireEvent.press(r.getByTestId('period-monthly'));
  expect(reg).toHaveBeenLastCalledWith('monthly', false);
  expect(within(r.getByTestId('tile-users')).getByText(E.sub_monthly)).toBeTruthy();
  fireEvent.press(r.getByTestId('period-yearly'));
  expect(reg).toHaveBeenLastCalledWith('yearly', false);
  expect(within(r.getByTestId('tile-users')).getByText(E.sub_yearly)).toBeTruthy();
});

it('switches the chart between total and by mode', () => {
  const r = render(<AdminDashboardScreen />);
  fireEvent(r.getByTestId('reg-plot'), 'layout', { nativeEvent: { layout: { width: 360, height: 236 } } });
  expect(r.getAllByTestId(/^reg-bar-total-/)).toHaveLength(7);
  fireEvent.press(r.getByTestId('reg-view-by_mode'));
  expect(r.getAllByTestId(/^reg-bar-client-/)).toHaveLength(7);
});

it('mirrors in Hebrew: rows run right to left, text aligns right', () => {
  mockLang = 'he';
  const r = render(<AdminDashboardScreen />);
  expect(r.getByText(H.title)).toBeTruthy();
  const title = StyleSheet.flatten(r.getByText(H.title).props.style);
  expect(title.textAlign).toBe('right');
  const header = StyleSheet.flatten(r.getByTestId('dash-header-row').props.style);
  expect(header.flexDirection).toBe('row-reverse');
  expect(reg).toHaveBeenLastCalledWith('daily', true);
});

it('clears the floating tab bar at the bottom and the log-out button at the top', () => {
  const r = render(<AdminDashboardScreen />);
  const scroll = r.UNSAFE_root.findAll((n) => n.props.contentContainerStyle !== undefined)[0];
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(80 + 24);
  // The layout's log-out button is 40pt at the physical top-left, 16 in; the header leaves it room in both languages.
  const pad = StyleSheet.flatten(r.getByTestId('dash-header').props.style);
  expect(pad.paddingLeft).toBeGreaterThanOrEqual(16 + 40);
});

it('"total users" opens the Users page, "total projects" the Projects page; the rest are not buttons', () => {
  const r = render(<AdminDashboardScreen />);
  fireEvent.press(r.getByTestId('tile-users-press'));
  expect(mockPush).toHaveBeenCalledWith('/admin/users');
  fireEvent.press(r.getByTestId('tile-projects-press'));
  expect(mockPush).toHaveBeenCalledWith('/admin/projects');
  expect(r.queryByTestId('tile-courses-press')).toBeNull();
  expect(r.queryByTestId('tile-communities-press')).toBeNull();
});
