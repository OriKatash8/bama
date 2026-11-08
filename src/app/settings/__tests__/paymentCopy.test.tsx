import React from 'react';

import { act, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import BalanceScreen from '../payment';
import PricingScreen from '../pricing';

/**
 * Wording on the balance and pricing screens, link mode versus everyone else. Link mode
 * never charges anything by itself, so it must not say "charges on" / "waiting to be
 * charged" / "details are sent with the demand"; and nobody may see the minimum fee
 * line read as if the fee were ₪0.
 */

let mockView: Record<string, unknown> = { enabled: false, hasCard: false };
let mockFee: Record<string, unknown> = {};
let mockLang = 'en';

// 2099-11-09 noon UTC: far in the future (so the window is "still open") on a stable date.
const FUTURE = Math.floor(Date.UTC(2099, 10, 9, 12) / 1000);
const baseFee = {
  professionalId: 'u1', feeStatus: 'owed', feeRate: 0.03, baseAmount: 10, minFeeApplied: 6, feeDue: 6,
  slotActive: false, engagementStatus: 'completed', status: 'pending', feePaid: false,
  chargeDueAt: { seconds: FUTURE, nanoseconds: 0 },
};

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (p: string) => `bama://${p}` }));
jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useModeAccent: () => ({ accent: '#1e4fa3' }), useTabBarClearance: () => 0 }));
jest.mock('@core/hooks/useTheme', () => ({ useTheme: () => ({ text: '#000', textMuted: '#666' }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'u1' } }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: jest.Mock }) => unknown) => s({ showToast: jest.fn() }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(async () => ({ title: 'Wedding shoot' })) }));
jest.mock('@features/pricing/services/feesService', () => ({
  listenToMyFees: (_uid: string, cb: (m: Map<string, unknown>) => void) => {
    cb(new Map([['p1', mockFee]]));
    return () => undefined;
  },
}));
jest.mock('@features/pricing/services/paymentMethodService', () => ({ requestMyPaymentLinkNow: jest.fn() }));
jest.mock('@features/pricing/hooks/usePaymentMethod', () => ({
  usePaymentMethod: () => ({ view: mockView, refresh: jest.fn(async () => undefined) }),
}));
jest.mock('@features/pricing/hooks/usePricingConfig', () => ({
  usePricingConfig: () => ({ feePercent: 3, minFeeAmount: 6, maxOpenProjects: 3 }),
}));
jest.mock('@features/pricing/components/PaymentMethodRow', () => ({ PaymentMethodRow: () => null }));

async function balance() {
  const r = render(<BalanceScreen />);
  await act(async () => {});
  return r;
}

beforeEach(() => {
  mockLang = 'en';
  mockView = { enabled: false, hasCard: false };
  mockFee = { ...baseFee };
});

describe('minimum-fee line', () => {
  it('shows the real percentage amount and the fee\'s own minimum (en)', async () => {
    const r = await balance();
    expect(r.getByText('3% of ₪10 = ₪0.30 · ₪6 minimum applies')).toBeTruthy();
    expect(r.queryByText(/= ₪0\)/)).toBeNull();
  });

  it('same in Hebrew', async () => {
    mockLang = 'he';
    const r = await balance();
    expect(r.getByText('3% מתוך ₪10 = ₪0.30 · חל מינימום של ₪6')).toBeTruthy();
  });

  it('reads the minimum off the fee, not a literal: a fee hired under a ₪9 floor says ₪9', async () => {
    mockFee = { ...baseFee, minFeeApplied: 9, feeDue: 9 };
    const r = await balance();
    expect(r.getByText('3% of ₪10 = ₪0.30 · ₪9 minimum applies')).toBeTruthy();
  });

  it('is the same line in link mode, and for a fee the percentage set there is no minimum line', async () => {
    mockView = { enabled: false, hasCard: false, linkMode: true };
    expect((await balance()).getByText('3% of ₪10 = ₪0.30 · ₪6 minimum applies')).toBeTruthy();
    mockFee = { ...baseFee, baseAmount: 1000, feeDue: 30, minFeeApplied: 6 };
    const r = await balance();
    expect(r.getByText('3% of ₪1,000')).toBeTruthy();
  });
});

describe('how to settle', () => {
  it('link mode: the Pay now / Grow text, and not the old demand text', async () => {
    mockView = { enabled: false, hasCard: false, linkMode: true };
    const r = await balance();
    expect(r.getByText(en.balance.how_body_link)).toBeTruthy();
    expect(r.queryByText(en.balance.how_body)).toBeNull();
    expect(en.balance.how_body_link).toContain("'Pay now'");
    expect(en.balance.how_body_link).toContain('bama.app.hk@gmail.com');
  });

  it('link mode in Hebrew is the agreed text', () => {
    expect(he.balance.how_body_link).toBe(
      "כשעמלה מגיעה לתשלום יופיע כאן כפתור 'שלם עכשיו', ותקבל התראה. התשלום מתבצע בדף מאובטח של Grow, והקבלה נשלחת אליך אוטומטית. לשאלות: bama.app.hk@gmail.com",
    );
  });

  it.each([
    ['payments off', { enabled: false, hasCard: false }],
    ['card mode', { enabled: true, hasCard: false }],
  ])('%s: unchanged text', async (_n, view) => {
    mockView = view;
    const r = await balance();
    expect(r.getByText(en.balance.how_body)).toBeTruthy();
    expect(r.queryByText(en.balance.how_body_link)).toBeNull();
  });

  it('keeps the grey paragraph in each mode', async () => {
    mockView = { enabled: false, hasCard: false, linkMode: true };
    expect((await balance()).getByText(en.balance.link_note)).toBeTruthy();
    mockView = { enabled: false, hasCard: false };
    expect((await balance()).getByText(en.balance.no_charge_note)).toBeTruthy();
  });
});

describe('a fee that is not yet due', () => {
  it('link mode: the early-pay hint replaces "Payable from" (the fee is payable now), still "Pending"', async () => {
    mockView = { enabled: false, hasCard: false, linkMode: true };
    const r = await balance();
    expect(r.queryByText('Payable from Nov 9')).toBeNull();
    expect(r.getByTestId('pay-early-hint-p1').props.children).toContain('Nov 9');
    expect(r.getByTestId('charge-state-p1').props.children).toBe('Pending');
    expect(r.queryByText(/Charges on/)).toBeNull();
    expect(r.queryByText('Waiting to be charged')).toBeNull();
  });

  it('link mode in Hebrew', async () => {
    mockLang = 'he';
    mockView = { enabled: false, hasCard: false, linkMode: true };
    const r = await balance();
    expect(r.getByTestId('charge-state-p1').props.children).toBe('ממתין');
    expect(r.queryByText(/^פתוחה לתשלום החל מ-/)).toBeNull();
    expect(r.getByText(/^אפשר לשלם כבר עכשיו, או עד/)).toBeTruthy();
    expect(r.queryByText(/^תיגבה בתאריך/)).toBeNull();
  });

  it('card mode keeps "Charges on" and "Waiting to be charged"', async () => {
    mockView = { enabled: true, hasCard: false };
    const r = await balance();
    expect(r.getByText('Charges on Nov 9')).toBeTruthy();
    expect(r.getByTestId('charge-state-p1').props.children).toBe(en.balance.charge_state_idle);
  });

  it('payments off keeps "Charges on" and shows no state line at all', async () => {
    const r = await balance();
    expect(r.getByText('Charges on Nov 9')).toBeTruthy();
    expect(r.queryByTestId('charge-state-p1')).toBeNull();
  });
});

describe('pricing screen settlement text', () => {
  it('link mode shows the same Pay now text; otherwise the old text', async () => {
    mockView = { enabled: false, hasCard: false, linkMode: true };
    let r = render(<PricingScreen />);
    await act(async () => {});
    expect(r.getByText(en.balance.how_body_link)).toBeTruthy();
    r.unmount();
    mockView = { enabled: false, hasCard: false };
    r = render(<PricingScreen />);
    await act(async () => {});
    expect(r.getByText(en.balance.how_body)).toBeTruthy();
    expect(r.queryByText(en.balance.how_body_link)).toBeNull();
  });
});

it('every new key exists in both languages', () => {
  for (const k of ['how_body_link', 'status_pending_link', 'charge_state_idle_link', 'line_min'] as const) {
    expect((he.balance as Record<string, string>)[k]).toBeTruthy();
    expect((en.balance as Record<string, string>)[k]).toBeTruthy();
  }
  for (const k of ['{{rate}}', '{{base}}', '{{calculated}}', '{{min}}']) {
    expect(he.balance.line_min).toContain(k);
    expect(en.balance.line_min).toContain(k);
  }
});
