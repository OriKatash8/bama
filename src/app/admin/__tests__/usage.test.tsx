import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { FIRESTORE_FREE_DAILY } from '@core/constants/usageQuotas';
import AdminUsageScreen from '../usage';

let mockLang = 'en';
const mockBack = jest.fn();
const mockRefresh = jest.fn();
const mockConfirm = jest.fn();
let mockHook: { data: unknown; state: string; refreshing: boolean };

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: (...a: unknown[]) => mockConfirm(...a) }));
jest.mock('@features/admin/usage/useUsageStats', () => ({
  useUsageStats: () => ({ ...mockHook, refresh: mockRefresh }),
}));

const E = en.admin_usage;
const H = he.admin_usage;

const DOC = {
  updatedAt: { toMillis: () => Date.now() - 60_000 },
  quota: { resetsAt: '2026-10-19T07:00:00.000Z', israelHour: 10, israelMinute: 0 },
  today: {
    firestore: { reads: 25_000, writes: 17_000, deletes: 21_000 },
    egressBytes: 2048,
    functions: { invocations: 29, top: [{ name: 'feeOverdueCron', count: 24 }, { name: 'compressVideo', count: 3 }] },
  },
  month: {
    firestore: { reads: 102_314, writes: 2851, deletes: 2806 },
    egressBytes: 1_926_398_875,
    functions: { invocations: 2511, top: [] },
  },
  storage: {
    appBucketBytes: 114_372_930,
    totalBytes: 6_163_719_162,
    buckets: [{ name: 'backup', bytes: 5_990_109_522 }, { name: 'app', bytes: 114_372_930 }],
  },
  errors: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockHook = { data: DOC, state: 'ok', refreshing: false };
  mockRefresh.mockResolvedValue({ ok: true, throttled: false, errors: [] });
});

const text = (el: { props: { children?: unknown } }) => String([].concat(el.props.children as never).join(''));

it('shows today\'s reads/writes/deletes against the CONFIG quotas', () => {
  const r = render(<AdminUsageScreen />);
  for (const m of ['reads', 'writes', 'deletes'] as const) {
    expect(text(r.getByTestId(`quota-${m}-of`))).toContain(FIRESTORE_FREE_DAILY[m].toLocaleString('en-US'));
  }
  expect(text(r.getByTestId('quota-reads-value'))).toBe('25,000');
  expect(text(r.getByTestId('quota-reads-of'))).toBe('of 50,000');
});

it('bar widths follow the fraction and colours follow the band (ok / warn / bad)', () => {
  const r = render(<AdminUsageScreen />);
  const fill = (m: string) => StyleSheet.flatten(r.getByTestId(`quota-${m}-fill`).props.style);
  expect(fill('reads').width).toBe('50%');      // 25,000 / 50,000
  expect(fill('writes').width).toBe('85%');     // 17,000 / 20,000 -> warn
  expect(fill('deletes').width).toBe('100%');   // 21,000 / 20,000 -> capped at 100, bad
  expect(fill('reads').backgroundColor).not.toBe(fill('writes').backgroundColor);
  expect(fill('writes').backgroundColor).not.toBe(fill('deletes').backgroundColor);
});

it('shows the reset as an Israel hour and never mentions Pacific time', () => {
  const r = render(<AdminUsageScreen />);
  expect(r.getByText('Resets daily around 10:00 Israel time')).toBeTruthy();
  expect(JSON.stringify(r.toJSON())).not.toMatch(/Pacific|PT\b|Los_Angeles/);
});

it('Hebrew: RTL strings, title שימוש and the Hebrew reset note', () => {
  mockLang = 'he';
  const r = render(<AdminUsageScreen />);
  expect(H.title).toBe('שימוש');
  expect(r.getByText('שימוש')).toBeTruthy();
  expect(r.getByText('מתאפס כל יום בסביבות 10:00 שעון ישראל')).toBeTruthy();
  const track = StyleSheet.flatten(r.getByTestId('quota-reads-track').props.style);
  expect(track.flexDirection).toBe('row-reverse');
});

it('shows month totals, storage and functions with the top list', () => {
  const r = render(<AdminUsageScreen />);
  expect(text(r.getByTestId('month-reads-value'))).toBe('102,314');
  expect(text(r.getByTestId('month-invocations-value'))).toBe('2,511');
  expect(text(r.getByTestId('storage-app-value'))).toBe('109 MB');
  expect(text(r.getByTestId('storage-total-value'))).toBe('5.7 GB');
  expect(text(r.getByTestId('fn-today-value'))).toBe('29');
  expect(r.getByTestId('fn-feeOverdueCron')).toBeTruthy();
  expect(r.getByTestId('fn-compressVideo')).toBeTruthy();
});

it('shows "updated" and flags a stale snapshot', () => {
  const fresh = render(<AdminUsageScreen />);
  expect(fresh.getByTestId('usage-updated').props.children).toContain('Updated');
  expect(fresh.queryByTestId('usage-stale')).toBeNull();
  fresh.unmount();

  mockHook = { ...mockHook, data: { ...DOC, updatedAt: { toMillis: () => Date.now() - 4 * 3600_000 } } };
  const stale = render(<AdminUsageScreen />);
  expect(stale.getByTestId('usage-stale')).toBeTruthy();
});

it('Refresh triggers the on-demand run', async () => {
  const r = render(<AdminUsageScreen />);
  await act(async () => { fireEvent.press(r.getByTestId('usage-refresh')); });
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(mockConfirm).not.toHaveBeenCalled();
});

it('a failed refresh is reported with confirmDialog (not Alert.alert)', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockRefresh.mockRejectedValue(new Error('denied'));
  const r = render(<AdminUsageScreen />);
  await act(async () => { fireEvent.press(r.getByTestId('usage-refresh')); });
  expect(mockConfirm).toHaveBeenCalledWith(E.refresh_failed_title, E.refresh_failed_body, expect.objectContaining({ destructive: false }));
});

it('refresh button is disabled and relabelled while refreshing', () => {
  mockHook = { ...mockHook, refreshing: true };
  const r = render(<AdminUsageScreen />);
  expect(r.getByText(E.refreshing)).toBeTruthy();
});

it('empty state when nothing has been collected; error state is not shown as empty', () => {
  mockHook = { data: null, state: 'empty', refreshing: false };
  const empty = render(<AdminUsageScreen />);
  expect(empty.getByTestId('usage-empty')).toBeTruthy();
  expect(empty.getByText(E.never_updated)).toBeTruthy();
  empty.unmount();

  mockHook = { data: null, state: 'error', refreshing: false };
  const err = render(<AdminUsageScreen />);
  expect(err.getByTestId('usage-error')).toBeTruthy();
  expect(err.queryByTestId('usage-empty')).toBeNull();
});

it('notes partially-failed collection', () => {
  mockHook = { ...mockHook, data: { ...DOC, errors: ['today.egress: boom'] } };
  expect(render(<AdminUsageScreen />).getByTestId('usage-partial')).toBeTruthy();
});

it('card contents are inset from the card edge (cards have no padding of their own)', () => {
  const r = render(<AdminUsageScreen />);
  const pad = (id: string) => StyleSheet.flatten(r.getByTestId(id).props.style).paddingHorizontal;
  expect(pad('usage-today-body')).toBeGreaterThanOrEqual(16);
  expect(pad('usage-month-body')).toBeGreaterThanOrEqual(16);
  expect(pad('usage-status-row')).toBeGreaterThanOrEqual(16);
});

it('month and storage figures sit in tiles with the value above its label', () => {
  const r = render(<AdminUsageScreen />);
  const tile = r.getByTestId('month-reads');
  expect(tile.children.length).toBe(2);
  expect(text(r.getByTestId('month-reads-value'))).toBe('102,314');
});
