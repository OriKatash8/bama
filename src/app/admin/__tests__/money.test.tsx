import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import MoneyAdmin from '../money';
import { useCancellationLog } from '@features/admin/useCancellationLog';

let mockLang = 'en';

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@features/admin/useCancellationLog', () => ({ useCancellationLog: jest.fn() }));

const E = en.admin_money;
const H = he.admin_money;
const log = useCancellationLog as jest.Mock;

const ENTRIES = [
  { id: 'c1', kind: 'project', title: 'Kitchen remodel', actorName: 'Avi', ts: 1_700_000_000, projectId: 'p1', chatId: 'chat1' },
  { id: 'c2', kind: 'purchase', title: '', actorName: null, ts: 0 },
  { id: 'c3', kind: 'project', title: 'No chat', actorName: null, ts: 0, projectId: 'p3', chatId: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockLang = 'en';
  log.mockReturnValue({ entries: [] });
});
afterEach(() => jest.useRealTimers());

const valueOf = (r: ReturnType<typeof render>, id: string) =>
  r.getByTestId(`${id}-value`).props.accessibilityLabel ?? r.getByTestId(`${id}-value`).props.children;

it('shows the title and subtitle, with no back button (a tab root)', () => {
  const r = render(<MoneyAdmin />);
  expect(r.getByText(E.title)).toBeTruthy();
  expect(r.getByText(E.greeting)).toBeTruthy();
  expect(r.queryByTestId('admin-back')).toBeNull();
});

it('shows the four placeholder figures as stat tiles, each with a footer line', () => {
  const r = render(<MoneyAdmin />);
  expect(valueOf(r, 'tile-revenue')).toBe('₪0');
  expect(valueOf(r, 'tile-fees')).toBe('₪0');
  expect(valueOf(r, 'tile-payouts')).toBe('₪0');
  expect(valueOf(r, 'tile-transactions')).toBe('0');
  expect(within(r.getByTestId('tile-revenue')).getByText(E.total_revenue)).toBeTruthy();
  for (const id of ['tile-revenue', 'tile-fees', 'tile-transactions']) {
    expect(within(r.getByTestId(id)).getByText(en.admin_dashboard.all_time)).toBeTruthy();
  }
  // Pending payouts is a balance now, not a running total.
  expect(within(r.getByTestId('tile-payouts')).getByText(E.pending_now)).toBeTruthy();
});

it('the flow chart names every source and switches between daily, weekly, monthly and yearly', () => {
  const r = render(<MoneyAdmin />);
  const chart = within(r.getByTestId('money-flow'));
  expect(chart.getByText(E.flow_heading)).toBeTruthy();
  for (const k of ['src_marketplace', 'src_projects', 'src_courses', 'src_subscriptions', 'src_other'] as const) {
    expect(chart.getByText(`${E[k]} ₪0`)).toBeTruthy();
  }
  expect(r.getByTestId('period-daily').props.accessibilityState.selected).toBe(true);
  fireEvent.press(r.getByTestId('period-weekly'));
  expect(r.getByTestId('period-weekly').props.accessibilityState.selected).toBe(true);
  expect(r.getByTestId('period-daily').props.accessibilityState.selected).toBe(false);
  fireEvent.press(r.getByTestId('period-monthly'));
  expect(r.getByTestId('period-monthly').props.accessibilityState.selected).toBe(true);
  fireEvent.press(r.getByTestId('period-yearly'));
  expect(r.getByTestId('period-yearly').props.accessibilityState.selected).toBe(true);
  expect(r.getByText(new Date().toLocaleDateString('en-US', { month: 'short' }))).toBeTruthy();
});

it('says so when there are no cancellations', () => {
  const r = render(<MoneyAdmin />);
  expect(within(r.getByTestId('cancellations-card')).getByText(E.no_cancellations)).toBeTruthy();
});

it('lists each cancellation with its kind, title and who cancelled it', () => {
  log.mockReturnValue({ entries: ENTRIES });
  const r = render(<MoneyAdmin />);
  expect(r.queryByTestId('cancellations-empty')).toBeNull();
  const first = within(r.getByTestId('cancellation-c1'));
  expect(first.getByText(`${E.type_project} · Kitchen remodel`)).toBeTruthy();
  expect(first.getByText(`${E.cancelled_by} Avi`)).toBeTruthy();
  const second = within(r.getByTestId('cancellation-c2'));
  expect(second.getByText(`${E.type_purchase} · —`)).toBeTruthy();
  expect(second.getByText(`${E.cancelled_by} —`)).toBeTruthy();
  expect(within(r.getByTestId('cancellations-card')).getByText('3')).toBeTruthy();
});

it("tapping a cancelled project opens its chat; rows without a chat aren't buttons", () => {
  log.mockReturnValue({ entries: ENTRIES });
  const r = render(<MoneyAdmin />);
  expect(r.getByTestId('cancellation-c1').props.accessibilityRole).toBe('button');
  fireEvent.press(r.getByTestId('cancellation-c1'));
  expect(mockPush).toHaveBeenCalledWith('/admin/project-chat?chatId=chat1&projectId=p1');
  for (const id of ['cancellation-c2', 'cancellation-c3']) {
    expect(r.getByTestId(id).props.accessibilityRole).toBeUndefined();
    fireEvent.press(r.getByTestId(id));
  }
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it('keeps the coming-soon note', () => {
  const r = render(<MoneyAdmin />);
  const note = within(r.getByTestId('coming-soon'));
  expect(note.getByText(E.coming_soon_title)).toBeTruthy();
  expect(note.getByText(E.coming_soon_body)).toBeTruthy();
});

it('mirrors in Hebrew: rows run right to left, text aligns right', () => {
  mockLang = 'he';
  log.mockReturnValue({ entries: ENTRIES });
  const r = render(<MoneyAdmin />);
  expect(StyleSheet.flatten(r.getByText(H.title).props.style).textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByText(H.coming_soon_title).props.style).textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByTestId('cancellation-c1').props.style).flexDirection).toBe('row-reverse');
  expect(r.getByText(`${H.type_project} · Kitchen remodel`)).toBeTruthy();
  expect(StyleSheet.flatten(r.getByTestId('dash-header-row').props.style).flexDirection).toBe('row-reverse');
});

it('clears the floating tab bar at the bottom', () => {
  const r = render(<MoneyAdmin />);
  const scroll = r.UNSAFE_root.findAll((n) => n.props.contentContainerStyle !== undefined)[0];
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(80 + 24);
});
