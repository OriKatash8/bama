import React from 'react';

import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import BalanceScreen from '../payment';

/**
 * The balance screen in payment-link mode: no card row, a "Pay now" button only on a
 * link that is still the right one, an "add phone" prompt when there is no mobile
 * number, and opening the page settles nothing.
 */

const mockPush = jest.fn();
const mockOpen = jest.fn(async () => ({ type: 'dismiss' }));
const mockRefresh = jest.fn(async () => undefined);
const mockToast = jest.fn();
const mockRequestNow = jest.fn();
let mockView: Record<string, unknown> = { enabled: false, hasCard: false, linkMode: true };
let mockFee: Record<string, unknown> = {};

const baseFee = {
  professionalId: 'u1', feeStatus: 'owed', feeRate: 0.03, baseAmount: 1000, feeDue: 30, slotActive: false,
  engagementStatus: 'completed', status: 'pending', feePaid: false,
  chargeDueAt: { seconds: 1, nanoseconds: 0 },
};
const link = (over: Record<string, unknown> = {}) => ({
  url: 'https://pay.grow.example/abc', processId: 'L1', amount: 30, ...over,
});

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...a: unknown[]) => (mockOpen as any)(...a) }));
jest.mock('expo-linking', () => ({ createURL: (p: string) => `bama://${p.replace(/^\//, '')}` }));
jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useModeAccent: () => ({ accent: '#1e4fa3' }), useTabBarClearance: () => 0 }));
jest.mock('@core/hooks/useTheme', () => ({ useTheme: () => ({ text: '#000', textMuted: '#666' }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'u1' } }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: jest.Mock }) => unknown) => s({ showToast: (...a: unknown[]) => mockToast(...a) } as never),
}));
jest.mock('@features/pricing/services/paymentMethodService', () => ({
  requestMyPaymentLinkNow: (...a: unknown[]) => mockRequestNow(...a),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(async () => ({ title: 'Wedding shoot' })) }));
jest.mock('@features/pricing/services/feesService', () => ({
  listenToMyFees: (_uid: string, cb: (m: Map<string, unknown>) => void) => {
    cb(new Map([['p1', mockFee]]));
    return () => undefined;
  },
}));
jest.mock('@features/pricing/hooks/usePaymentMethod', () => ({
  usePaymentMethod: () => ({ view: mockView, refresh: mockRefresh }),
}));
jest.mock('@features/pricing/components/PaymentMethodRow', () => {
  const { Text: T } = require('react-native');
  return { PaymentMethodRow: ({ view }: { view: { enabled: boolean } | null }) =>
    (view?.enabled ? <T testID="card-row">card row</T> : null) };
});

async function renderScreen() {
  const r = render(<BalanceScreen />);
  await act(async () => {});
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockView = { enabled: false, hasCard: false, linkMode: true };
});

it('awaiting payment on a live link: Pay now, the state line and the link note; no card row', async () => {
  mockFee = { ...baseFee, chargeState: 'awaiting_payment', paymentLink: link() };
  const r = await renderScreen();
  expect(r.getByTestId('pay-now-p1')).toBeTruthy();
  expect(r.getByTestId('charge-state-p1').props.children).toBe(en.balance.charge_state_awaiting_payment);
  expect(r.getByText(en.balance.link_note)).toBeTruthy();
  expect(r.queryByTestId('card-row')).toBeNull();
  expect(r.queryByText(en.balance.no_charge_note)).toBeNull();
});

it('Pay now opens the link in an auth session returning to the payment screen, then says it is updating', async () => {
  mockFee = { ...baseFee, chargeState: 'awaiting_payment', paymentLink: link() };
  const r = await renderScreen();
  expect(r.queryByTestId('link-pending-p1')).toBeNull();
  await act(async () => { fireEvent.press(r.getByTestId('pay-now-p1')); });
  expect(mockOpen).toHaveBeenCalledWith('https://pay.grow.example/abc', 'bama://settings/payment');
  expect(mockRefresh).toHaveBeenCalled();
  expect(r.getByTestId('link-pending-p1').props.children).toBe(en.balance.link_pending_confirm);
  // The fee was not marked paid by anything the screen did.
  expect(r.getByTestId('pay-now-p1')).toBeTruthy();
});

it('no Pay now when the fee is already paid', async () => {
  mockFee = { ...baseFee, chargeState: 'awaiting_payment', paymentLink: link(), feePaid: true, status: 'paid' };
  const r = await renderScreen();
  expect(r.queryByTestId('pay-now-p1')).toBeNull();
});

it.each([
  ['the link is for an amount no longer owed', { paymentLink: link({ amount: 50 }) }],
  ['the link was superseded', { paymentLink: link({ superseded: true }) }],
  ['the link is not https', { paymentLink: link({ url: 'http://pay.example/x' }) }],
  ['there is no link', { paymentLink: undefined }],
])('%s: the stale URL is never opened; tapping asks the server for a fresh link', async (_n, over) => {
  mockFee = { ...baseFee, chargeState: 'awaiting_payment', ...over };
  mockRequestNow.mockResolvedValue({ status: 'ready', url: 'https://pay.grow.example/fresh' });
  const r = await renderScreen();
  await act(async () => { fireEvent.press(r.getByTestId('pay-now-p1')); });
  expect(mockRequestNow).toHaveBeenCalledWith({ projectId: 'p1' });
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenCalledWith('https://pay.grow.example/fresh', 'bama://settings/payment');
});

it('needs a phone: says so and offers the phone settings; no Pay now', async () => {
  mockFee = { ...baseFee, chargeState: 'needs_phone' };
  const r = await renderScreen();
  expect(r.getByTestId('charge-state-p1').props.children).toBe(en.balance.charge_state_needs_phone);
  expect(r.queryByTestId('pay-now-p1')).toBeNull();
  fireEvent.press(r.getByTestId('add-phone-p1'));
  expect(mockPush).toHaveBeenCalledWith('/settings/phone');
});

it('not in link mode (card mode or off): never a Pay now or phone prompt', async () => {
  mockFee = { ...baseFee, chargeState: 'awaiting_payment', paymentLink: link() };
  mockView = { enabled: false, hasCard: false };
  const r = await renderScreen();
  expect(r.queryByTestId('pay-now-p1')).toBeNull();
  expect(r.queryByTestId('charge-state-p1')).toBeNull();
  expect(r.getByText(en.balance.no_charge_note)).toBeTruthy();
});

it('has Hebrew copy for every new key', () => {
  for (const k of ['charge_state_awaiting_payment', 'charge_state_needs_phone', 'pay_now', 'add_phone',
    'pay_open_failed', 'link_pending_confirm', 'link_note'] as const) {
    expect(typeof (he.balance as Record<string, string>)[k]).toBe('string');
    expect(typeof (en.balance as Record<string, string>)[k]).toBe('string');
  }
  expect(he.balance.charge_state_needs_phone).toBe('הוסף מספר טלפון כדי לשלם את עמלת התיווך');
  expect(he.balance.pay_now).toBe('שלם עכשיו');
});

// ── Early payment: inside the 4-day contest window ───────────────────────────
describe('Pay now inside the contest window', () => {
  const inWindow = () => ({ seconds: Math.floor(Date.now() / 1000) + 3 * 86400, nanoseconds: 0 });
  const early = (over: Record<string, unknown> = {}) => ({
    ...baseFee, chargeDueAt: inWindow(), chargeState: 'idle', ...over,
  });

  it('completed and owed, no link yet: Pay now, the hint with the date, and the acceptance line', async () => {
    mockFee = early();
    const r = await renderScreen();
    expect(r.getByTestId('pay-now-p1')).toBeTruthy();
    expect(r.getByTestId('pay-early-hint-p1')).toBeTruthy();
    expect(r.getByTestId('pay-early-confirm-p1').props.children).toBe(en.balance.pay_early_confirm);
    // "Payable from <date>" would now be false.
    expect(r.queryByText(/Payable from/)).toBeNull();
  });

  it('first tap asks the server, then opens the URL it returns; the fee is not marked paid', async () => {
    mockFee = early();
    mockRequestNow.mockResolvedValue({ status: 'ready', url: 'https://pay.grow.example/early' });
    const r = await renderScreen();
    await act(async () => { fireEvent.press(r.getByTestId('pay-now-p1')); });
    expect(mockRequestNow).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(mockOpen).toHaveBeenCalledWith('https://pay.grow.example/early', 'bama://settings/payment');
    expect(r.getByTestId('pay-now-p1')).toBeTruthy();
  });

  it('a live link in the window opens directly, with no server call', async () => {
    mockFee = early({ chargeState: 'awaiting_payment', paymentLink: link() });
    const r = await renderScreen();
    await act(async () => { fireEvent.press(r.getByTestId('pay-now-p1')); });
    expect(mockRequestNow).not.toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalledWith('https://pay.grow.example/abc', 'bama://settings/payment');
  });

  it('pending: tells the pro it is being prepared and opens nothing', async () => {
    mockFee = early();
    mockRequestNow.mockResolvedValue({ status: 'pending' });
    const r = await renderScreen();
    await act(async () => { fireEvent.press(r.getByTestId('pay-now-p1')); });
    expect(mockToast).toHaveBeenCalledWith(en.balance.pay_preparing, 'info');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('needs_phone from the server: routes to the phone settings', async () => {
    mockFee = early();
    mockRequestNow.mockResolvedValue({ status: 'needs_phone' });
    const r = await renderScreen();
    await act(async () => { fireEvent.press(r.getByTestId('pay-now-p1')); });
    expect(mockPush).toHaveBeenCalledWith('/settings/phone');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'unavailable' }],
    [{ status: 'ready', url: 'http://not-https.example' }],
  ])('unusable answer %j: error toast, nothing opened', async (answer) => {
    mockFee = early();
    mockRequestNow.mockResolvedValue(answer);
    const r = await renderScreen();
    await act(async () => { fireEvent.press(r.getByTestId('pay-now-p1')); });
    expect(mockToast).toHaveBeenCalledWith(en.balance.pay_open_failed, 'error');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('a network failure from the callable is an error toast, and the button works again', async () => {
    mockFee = early();
    mockRequestNow.mockRejectedValue(new Error('offline'));
    const r = await renderScreen();
    await act(async () => { fireEvent.press(r.getByTestId('pay-now-p1')); });
    expect(mockToast).toHaveBeenCalledWith(en.balance.pay_open_failed, 'error');
    expect(r.getByTestId('pay-now-p1').props.accessibilityState?.disabled).not.toBe(true);
  });

  it.each([
    ['contested', { engagementStatus: 'disputed', adminReviewPending: true }],
    ['in review (flag only)', { adminReviewPending: true }],
    ['already paid', { feePaid: true, status: 'paid' }],
    ['nothing due', { feeDue: 0 }],
    ['voided', { status: 'not_owed', feeDue: 0 }],
    ['not owed (exempt)', { feeStatus: 'exempt' }],
  ])('no Pay now when %s', async (_n, over) => {
    mockFee = early(over);
    const r = await renderScreen();
    expect(r.queryByTestId('pay-now-p1')).toBeNull();
    expect(r.queryByTestId('pay-early-hint-p1')).toBeNull();
  });

  it('no mobile on file: the phone prompt, not Pay now', async () => {
    mockFee = early({ chargeState: 'needs_phone' });
    const r = await renderScreen();
    expect(r.queryByTestId('pay-now-p1')).toBeNull();
    expect(r.getByTestId('add-phone-p1')).toBeTruthy();
  });

  it('not in link mode: no early button', async () => {
    mockFee = early();
    mockView = { enabled: false, hasCard: false };
    const r = await renderScreen();
    expect(r.queryByTestId('pay-now-p1')).toBeNull();
  });

  it('has Hebrew and English copy for the new keys', () => {
    for (const k of ['pay_early_hint', 'pay_early_confirm', 'pay_preparing'] as const) {
      expect(typeof (he.balance as Record<string, string>)[k]).toBe('string');
      expect(typeof (en.balance as Record<string, string>)[k]).toBe('string');
    }
    expect(he.balance.pay_early_confirm).toBe('תשלום עכשיו מאשר את הסכום.');
    expect(he.balance.pay_early_hint).toContain('אפשר לשלם כבר עכשיו, או עד {{date}}');
  });
});
