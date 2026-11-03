import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { confirmDialog } from '@utils/confirmDialog';
import AdminFeesScreen from '../fees';

/**
 * Charge issues: fees whose automatic card charge needs a person — every retry
 * failed, or money was taken that does not match the balance. Listed with a clear
 * label so they cannot sit unnoticed in the database.
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
    adminListChargeIssues: jest.fn(),
    adminAcknowledgeChargeIssue: jest.fn(),
    adminListPaymentLinks: jest.fn(),
  };
  return { callFunction: (name: string) => fns[name], __fns: fns };
});

const fns = (jest.requireMock('@core/firebase/functions') as { __fns: Record<string, jest.Mock> }).__fns;
const confirm = confirmDialog as jest.Mock;
const E = en.admin_fees;
const H = he.admin_fees;



const ROWS = {
  rows: [
    {
      projectId: 'p1', title: 'Wedding shoot', professionalId: 'pro-1', displayName: 'Moshe Levi',
      reason: 'settle_mismatch', chargeState: 'succeeded', chargedAmount: 100, feeDue: 60, attempts: 1,
      providerRef: 'ref-9', lastErrorCode: null, flaggedAt: Date.UTC(2026, 0, 5, 12), note: '',
    },
    {
      projectId: 'p2', title: 'Promo', professionalId: 'pro-2', displayName: 'Dana Cohen',
      reason: 'attempts_exhausted', chargeState: 'failed', chargedAmount: 0, feeDue: 100, attempts: 3,
      providerRef: null, lastErrorCode: 'declined', flaggedAt: Date.UTC(2026, 0, 6, 12), note: '',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockLang = 'en';
  fns.adminListArrears.mockResolvedValue({ graceDays: 7, rows: [] });
  fns.adminListFlaggedProjects.mockResolvedValue({ rows: [] });
  fns.adminListChargeIssues.mockResolvedValue(ROWS);
  fns.adminAcknowledgeChargeIssue.mockResolvedValue({ ok: true });
  fns.adminListPaymentLinks.mockResolvedValue({ awaiting: [], paid: [] });
});
afterEach(() => jest.useRealTimers());

async function renderPage() {
  const r = render(<AdminFeesScreen />);
  await act(async () => {});
  return r;
}

it('shows a third tab with the number of charge issues', async () => {
  const r = await renderPage();
  expect(r.getByText(`${E.tab_charges} (2)`)).toBeTruthy();
});

it('labels each issue plainly: charged-but-unmatched and exhausted', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('tab-charges'));
  expect(r.getByText(E.charge_reason_settle_mismatch)).toBeTruthy();
  expect(r.getByText(E.charge_reason_attempts_exhausted)).toBeTruthy();
  expect(r.getByText('Charged ₪100 · balance now ₪60')).toBeTruthy();
  expect(r.getByText('3 attempts · ₪100 still owed')).toBeTruthy();
});

it('acknowledging calls the callable with the fee, then refreshes', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('tab-charges'));
  await act(async () => { fireEvent.press(r.getByTestId('charge-ack-p1:pro-1')); });
  expect(fns.adminAcknowledgeChargeIssue).toHaveBeenCalledWith({ projectId: 'p1', professionalId: 'pro-1' });
  expect(fns.adminListChargeIssues).toHaveBeenCalledTimes(2);
});

it('a failed load says so instead of showing an empty list', async () => {
  fns.adminListChargeIssues.mockRejectedValue(new Error('denied'));
  const r = await renderPage();
  fireEvent.press(r.getByTestId('tab-charges'));
  expect(r.getByTestId('charges-error')).toBeTruthy();
  expect(r.queryByTestId('charges-empty')).toBeNull();
});

it('an empty list reads as clear', async () => {
  fns.adminListChargeIssues.mockResolvedValue({ rows: [] });
  const r = await renderPage();
  fireEvent.press(r.getByTestId('tab-charges'));
  expect(r.getByText(E.empty_charges)).toBeTruthy();
});

it('has Hebrew copy for every new key', () => {
  for (const k of Object.keys(E).filter((x) => x.includes('charge'))) {
    expect((H as Record<string, string>)[k]).toBeTruthy();
  }
});

const LINK = (over = {}) => ({
  projectId: 'p5', title: 'Promo', professionalId: 'pro-5', displayName: 'Noa Bar', amount: 120,
  processId: 'L5', createdAt: Date.UTC(2026, 0, 7, 12), stale: false, paidAt: null, transactionId: null, ...over,
});

describe('payment links', () => {
  it('shows a Payment links tab counting links awaiting payment', async () => {
    fns.adminListPaymentLinks.mockResolvedValue({ awaiting: [LINK(), LINK({ projectId: 'p6', stale: true })], paid: [] });
    const r = await renderPage();
    expect(r.getByText(`${E.tab_links} (2)`)).toBeTruthy();
  });

  it('lists awaiting and paid links, flagging an out-of-date one', async () => {
    fns.adminListPaymentLinks.mockResolvedValue({
      awaiting: [LINK({ stale: true })],
      paid: [LINK({ projectId: 'p7', paidAt: Date.UTC(2026, 0, 9, 12), transactionId: 'T77', createdAt: null })],
    });
    const r = await renderPage();
    fireEvent.press(r.getByTestId('tab-links'));
    expect(r.getByTestId('link-awaiting-p5:pro-5')).toBeTruthy();
    expect(r.getByText(E.link_stale)).toBeTruthy();
    expect(r.getByText('₪120 · link created 07/01/2026')).toBeTruthy();
    expect(r.getByText(/₪120 · paid 09\/01\/2026/)).toBeTruthy();
    expect(r.getByTestId('link-paid-p7:pro-5')).toBeTruthy();
  });

  it('empty sections read as empty, not as an error', async () => {
    const r = await renderPage();
    fireEvent.press(r.getByTestId('tab-links'));
    expect(r.getByText(E.empty_links_awaiting)).toBeTruthy();
    expect(r.getByText(E.empty_links_paid)).toBeTruthy();
  });

  it('a failed load says so and does not blank the other tabs', async () => {
    fns.adminListPaymentLinks.mockRejectedValue(new Error('denied'));
    const r = await renderPage();
    expect(r.getByText(`${E.tab_charges} (2)`)).toBeTruthy();
    fireEvent.press(r.getByTestId('tab-links'));
    expect(r.getByTestId('links-error')).toBeTruthy();
    expect(r.queryByTestId('links-awaiting-empty')).toBeNull();
  });

  it('link review reasons are listed in Charge issues, with the received amount', async () => {
    fns.adminListChargeIssues.mockResolvedValue({ rows: [{
      projectId: 'p5', title: 'Promo', professionalId: 'pro-5', displayName: 'Noa Bar',
      reason: 'link_superseded', chargeState: 'awaiting_payment', chargedAmount: 120, feeDue: 80, attempts: 0,
      providerRef: 'T9', lastErrorCode: null, flaggedAt: Date.UTC(2026, 0, 8, 12), note: '',
    }] });
    const r = await renderPage();
    fireEvent.press(r.getByTestId('tab-charges'));
    expect(r.getByText(E.charge_reason_link_superseded)).toBeTruthy();
    expect(r.getByText('Received ₪120 · balance now ₪80')).toBeTruthy();
  });

  it('an unmatched payment is acknowledged by its transaction id', async () => {
    fns.adminListChargeIssues.mockResolvedValue({ rows: [{
      projectId: '', title: '', professionalId: '', displayName: '', transactionId: 'T42',
      reason: 'link_unmatched', chargeState: 'idle', chargedAmount: 50, feeDue: 0, attempts: 0,
      providerRef: 'T42', lastErrorCode: null, flaggedAt: Date.UTC(2026, 0, 8, 12), note: 'processId X feeKey -',
    }] });
    const r = await renderPage();
    fireEvent.press(r.getByTestId('tab-charges'));
    await act(async () => { fireEvent.press(r.getByTestId('charge-ack-tx:T42')); });
    expect(fns.adminAcknowledgeChargeIssue).toHaveBeenCalledWith({ transactionId: 'T42' });
  });

  it('every admin_fees key has Hebrew copy', () => {
    for (const k of Object.keys(E)) expect((H as Record<string, string>)[k]).toBeTruthy();
  });
});
