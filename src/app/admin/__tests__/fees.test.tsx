import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { confirmDialog } from '@utils/confirmDialog';
import AdminFeesScreen from '../fees';

/**
 * Fees & disputes, in the admin dashboard's design. The admin callables are
 * faked by name; the actions must still call them with the same arguments.
 */

let mockLang = 'en';
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockToast = jest.fn();

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => true, push: jest.fn() }),
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: jest.Mock }) => unknown) => s({ showToast: mockToast }),
}));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@core/firebase/functions', () => {
  const fns: Record<string, jest.Mock> = {
    adminListArrears: jest.fn(),
    adminListFlaggedProjects: jest.fn(),
    markDemandSent: jest.fn(),
    markFeePaid: jest.fn(),
  };
  return { callFunction: (name: string) => fns[name], __fns: fns };
});

const fns = (jest.requireMock('@core/firebase/functions') as { __fns: Record<string, jest.Mock> }).__fns;
const confirm = confirmDialog as jest.Mock;
const E = en.admin_fees;
const H = he.admin_fees;

const ARREARS = {
  graceDays: 14,
  rows: [
    {
      professionalId: 'pro-1', displayName: 'Moshe Levi', totalOwed: 1250,
      oldestUnpaidAt: Date.UTC(2026, 0, 5, 12), demandSentAt: null, blocked: true,
      projects: [
        { projectId: 'p1', title: 'Wedding shoot', owed: 1000, demandSentAt: null },
        { projectId: 'p2', title: 'Promo', owed: 250, demandSentAt: Date.UTC(2026, 1, 1, 12) },
      ],
    },
  ],
};
const FLAGGED = {
  rows: [
    {
      projectId: 'fp1', title: 'Music video', status: 'completed', reason: 'fee_disputed',
      proId: 'pro-2', proName: 'Yael', clientName: 'Noa', flaggedAt: Date.UTC(2026, 2, 3, 12), note: 'Client never paid',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockLang = 'en';
  fns.adminListArrears.mockResolvedValue(ARREARS);
  fns.adminListFlaggedProjects.mockResolvedValue(FLAGGED);
  fns.markDemandSent.mockResolvedValue({ ok: true });
  fns.markFeePaid.mockResolvedValue({ ok: true, paid: 1000 });
  confirm.mockResolvedValue(true);
});
afterEach(() => jest.useRealTimers());

async function renderPage() {
  const r = render(<AdminFeesScreen />);
  await act(async () => {});
  return r;
}

it('titles the page in English, under the admin header', async () => {
  const r = await renderPage();
  expect(r.getByText(E.title)).toBeTruthy();
  expect(r.getByTestId('dash-header')).toBeTruthy();
});

it('mirrors in Hebrew: the title aligns right and rows run right to left', async () => {
  mockLang = 'he';
  const r = await renderPage();
  expect(StyleSheet.flatten(r.getByText(H.title).props.style).textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByTestId('arrears-head-pro-1').props.style).flexDirection).toBe('row-reverse');
  expect(StyleSheet.flatten(r.getByTestId('project-p1:pro-1').props.style).flexDirection).toBe('row-reverse');
  expect(r.getByText(H.blocked)).toBeTruthy();
});

it('renders an arrears row per professional, with amounts formatted in ₪', async () => {
  const r = await renderPage();
  const row = within(r.getByTestId('arrears-pro-1'));
  expect(row.getByText('Moshe Levi')).toBeTruthy();
  expect(row.getByText(E.blocked)).toBeTruthy();
  expect(row.getByText('Total owed: ₪1,250')).toBeTruthy();
  expect(row.getByText('Oldest debt: 05/01/2026')).toBeTruthy();
  expect(row.getByText(E.demand_none)).toBeTruthy();
  expect(row.getByText('Wedding shoot · ₪1,000')).toBeTruthy();
  expect(row.getByText('Promo · ₪250')).toBeTruthy();
  expect(r.getByText('The block takes effect 14 days after the demand is sent.')).toBeTruthy();
  // A project whose demand was already sent offers only "Mark paid".
  expect(r.queryByTestId('demand-p2:pro-1')).toBeNull();
  expect(r.getByTestId('paid-p2:pro-1')).toBeTruthy();
});

it('tiles and tabs show the counts, each tile with a footer line', async () => {
  const r = await renderPage();
  expect(r.getByTestId('tile-arrears-value').props.accessibilityLabel).toBe('1');
  expect(r.getByTestId('tile-flagged-value').props.accessibilityLabel).toBe('1');
  expect(within(r.getByTestId('tile-arrears')).getByText('Total owed: ₪1,250')).toBeTruthy();
  expect(within(r.getByTestId('tile-flagged')).getByText(en.admin_dashboard.attention)).toBeTruthy();
  expect(r.getByText(`${E.tab_arrears} (1)`)).toBeTruthy();
  expect(r.getByText(`${E.tab_flagged} (1)`)).toBeTruthy();
});

it('the flagged tab lists projects needing review', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('tab-flagged'));
  const row = within(r.getByTestId('flagged-fp1'));
  expect(row.getByText('Music video')).toBeTruthy();
  expect(row.getByText(E.reason_fee_disputed)).toBeTruthy();
  expect(row.getByText('Professional: Yael')).toBeTruthy();
  expect(row.getByText('Client: Noa')).toBeTruthy();
  expect(row.getByText('Client never paid')).toBeTruthy();
});

it('mark demand sent confirms, calls markDemandSent for that fee record, then reloads', async () => {
  const r = await renderPage();
  await act(async () => { fireEvent.press(r.getByTestId('demand-p1:pro-1')); });
  expect(confirm).toHaveBeenCalledWith(E.title, E.confirm_demand, { confirm: en.common.confirm, cancel: en.common.cancel });
  expect(fns.markDemandSent).toHaveBeenCalledWith({ projectId: 'p1', professionalId: 'pro-1' });
  expect(mockToast).toHaveBeenCalledWith(E.demand_done, 'success');
  expect(fns.adminListArrears).toHaveBeenCalledTimes(2);
});

it('mark paid calls markFeePaid for that fee record', async () => {
  const r = await renderPage();
  await act(async () => { fireEvent.press(r.getByTestId('paid-p2:pro-1')); });
  expect(fns.markFeePaid).toHaveBeenCalledWith({ projectId: 'p2', professionalId: 'pro-1' });
  expect(mockToast).toHaveBeenCalledWith(E.paid_done, 'success');
});

it('a cancelled confirm writes nothing', async () => {
  confirm.mockResolvedValue(false);
  const r = await renderPage();
  await act(async () => { fireEvent.press(r.getByTestId('paid-p1:pro-1')); });
  expect(fns.markFeePaid).not.toHaveBeenCalled();
});

it('a failed load is an error with retry, never an empty list or a zero', async () => {
  fns.adminListArrears.mockRejectedValueOnce(new Error('denied'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const r = await renderPage();
  expect(r.getByText(E.load_failed_title)).toBeTruthy();
  expect(r.queryByText(E.empty_arrears)).toBeNull();
  expect(r.getByText(`${E.tab_arrears} (${E.count_unknown})`)).toBeTruthy();
  expect(r.getByTestId('tile-arrears-value').props.children).toBe('—');
  await act(async () => { fireEvent.press(r.getByTestId('fees-retry')); });
  expect(r.getByTestId('arrears-pro-1')).toBeTruthy();
  (console.error as jest.Mock).mockRestore();
});

it('empty lists show their empty states', async () => {
  fns.adminListArrears.mockResolvedValue({ graceDays: 14, rows: [] });
  fns.adminListFlaggedProjects.mockResolvedValue({ rows: [] });
  const r = await renderPage();
  expect(r.getByText(E.empty_arrears)).toBeTruthy();
  fireEvent.press(r.getByTestId('tab-flagged'));
  expect(r.getByText(E.empty_flagged)).toBeTruthy();
});

it('back returns to the previous page', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockBack).toHaveBeenCalled();
});
