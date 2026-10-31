import React from 'react';

import { act, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import BalanceScreen from '../payment';

/**
 * The brokerage-balance screen with the card feature. Hidden state must be exactly
 * today's screen; enabled state adds the card row and a plain-language charge line.
 */

let mockEnabled = false;
const mockFee = {
  professionalId: 'u1', feeStatus: 'owed', feeRate: 0.03, baseAmount: 1000, feeDue: 30, slotActive: false,
  engagementStatus: 'completed', status: 'pending', feePaid: false, chargeState: 'failed',
  chargeDueAt: { seconds: 1, nanoseconds: 0 },
};

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
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
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(async () => ({ title: 'Wedding shoot' })) }));
jest.mock('@features/pricing/services/feesService', () => ({
  listenToMyFees: (_uid: string, cb: (m: Map<string, unknown>) => void) => {
    cb(new Map([['p1', mockFee]]));
    return () => undefined;
  },
}));
jest.mock('@features/pricing/hooks/usePaymentMethod', () => ({
  usePaymentMethod: () => ({
    view: { enabled: mockEnabled, hasCard: false }, refresh: jest.fn(async () => undefined),
  }),
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

it('disabled: no card row, no charge line, and the original note that the app charges nothing', async () => {
  mockEnabled = false;
  const r = await renderScreen();
  expect(r.queryByTestId('card-row')).toBeNull();
  expect(r.queryByTestId('charge-state-p1')).toBeNull();
  expect(r.getByText(en.balance.no_charge_note)).toBeTruthy();
});

it('enabled: shows the card row, the charge-state line and the card note', async () => {
  mockEnabled = true;
  const r = await renderScreen();
  expect(r.getByTestId('card-row')).toBeTruthy();
  expect(r.getByTestId('charge-state-p1').props.children).toBe(en.balance.charge_state_failed);
  expect(r.getByText(en.balance.card_note)).toBeTruthy();
  expect(r.queryByText(en.balance.no_charge_note)).toBeNull();
});

