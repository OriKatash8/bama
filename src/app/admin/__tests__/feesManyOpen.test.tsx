import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { confirmDialog } from '@utils/confirmDialog';
import AdminFeesScreen from '../fees';
import { ADMIN_LIGHT } from '@features/communityAdmin/theme';

/**
 * Outstanding fees: a professional with 2 or more unpaid platform fees is marked
 * in red — the row tinted, a red edge, and a chip with the count — so the repeat
 * debtors stand out from someone who owes on a single project.
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
      oldestUnpaidAt: Date.UTC(2026, 0, 5, 12), demandSentAt: null, blocked: false,
      projects: [
        { projectId: 'p1', title: 'Wedding shoot', owed: 1000, demandSentAt: null },
        { projectId: 'p2', title: 'Promo', owed: 250, demandSentAt: null },
      ],
    },
    {
      professionalId: 'pro-3', displayName: 'Dana Cohen', totalOwed: 300,
      oldestUnpaidAt: Date.UTC(2026, 0, 9, 12), demandSentAt: null, blocked: false,
      projects: [{ projectId: 'p3', title: 'Event', owed: 300, demandSentAt: null }],
    },
    {
      // Listed because a fee blocks hiring, but only one still has money owed.
      professionalId: 'pro-4', displayName: 'Avi Ben', totalOwed: 200,
      oldestUnpaidAt: Date.UTC(2026, 0, 9, 12), demandSentAt: null, blocked: true,
      projects: [
        { projectId: 'p4', title: 'Clip', owed: 200, demandSentAt: null },
        { projectId: 'p5', title: 'Settled', owed: 0, demandSentAt: null },
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockLang = 'en';
  fns.adminListArrears.mockResolvedValue(ARREARS);
  fns.adminListFlaggedProjects.mockResolvedValue({ rows: [] });
});
afterEach(() => jest.useRealTimers());

async function renderPage() {
  const r = render(<AdminFeesScreen />);
  await act(async () => {});
  return r;
}
const flat = (id: string, r: Awaited<ReturnType<typeof renderPage>>) =>
  StyleSheet.flatten(r.getByTestId(id).props.style) as Record<string, unknown>;

it('a professional with 2 open fees is marked red, with the count', async () => {
  const r = await renderPage();
  const row = flat('arrears-pro-1', r);
  expect(row.backgroundColor).toBe(ADMIN_LIGHT.badBg);
  expect(row.borderLeftColor).toBe(ADMIN_LIGHT.bad);
  expect(row.borderLeftWidth).toBe(4);
  expect(within(r.getByTestId('arrears-pro-1')).getByText(E.open_fees.replace('{{n}}', '2'))).toBeTruthy();
});

it('one open fee is not marked', async () => {
  const r = await renderPage();
  const row = flat('arrears-pro-3', r);
  expect(row.backgroundColor).toBeUndefined();
  expect(row.borderLeftColor).toBeUndefined();
  expect(within(r.getByTestId('arrears-pro-3')).queryByText(E.open_fees.replace('{{n}}', '1'))).toBeNull();
});

it('only fees with money still owed count', async () => {
  const r = await renderPage();
  expect(flat('arrears-pro-4', r).backgroundColor).toBeUndefined();
});

it('says it in Hebrew too', async () => {
  mockLang = 'he';
  const r = await renderPage();
  expect(within(r.getByTestId('arrears-pro-1')).getByText(H.open_fees.replace('{{n}}', '2'))).toBeTruthy();
  // The red edge is on the right, where a Hebrew row starts.
  expect(flat('arrears-pro-1', r).borderRightColor).toBe(ADMIN_LIGHT.bad);
  expect(flat('arrears-pro-1', r).borderLeftColor).toBeUndefined();
});
