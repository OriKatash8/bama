import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { confirmDialog } from '@utils/confirmDialog';
import { PaymentMethodRow, formatExpiry } from '../PaymentMethodRow';
import * as service from '../../services/paymentMethodService';

let mockLang = 'en';
const mockToast = jest.fn();

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn(async () => ({ type: 'dismiss' })) }));
jest.mock('expo-linking', () => ({ createURL: (p: string) => `bama://${p.replace(/^\//, '')}` }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: jest.Mock }) => unknown) => s({ showToast: mockToast }),
}));
jest.mock('@core/hooks/useTheme', () => ({ useTheme: () => ({ text: '#000', textMuted: '#666' }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useModeAccent: () => ({ accent: '#1e4fa3' }) }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn(() => Promise.resolve(true)) }));
jest.mock('../../services/paymentMethodService', () => ({
  createCardSaveSession: jest.fn(),
  removeMyPaymentMethod: jest.fn(),
  fakeCompleteCardSave: jest.fn(),
}));

const svc = service as jest.Mocked<typeof service>;
const refresh = jest.fn(async () => undefined);
const card = { enabled: true, hasCard: true, last4: '4242', brand: 'visa', expMonth: 3, expYear: 2029, status: 'active' as const };

beforeEach(() => { jest.clearAllMocks(); mockLang = 'en'; });

describe('PaymentMethodRow', () => {
  it('renders nothing while unknown, and nothing when the server says it is not enabled', () => {
    expect(render(<PaymentMethodRow view={null} refresh={refresh} />).toJSON()).toBeNull();
    expect(render(<PaymentMethodRow view={{ enabled: false, hasCard: false }} refresh={refresh} />).toJSON()).toBeNull();
    // Even a stale view that still carries card fields stays hidden.
    expect(render(<PaymentMethodRow view={{ ...card, enabled: false }} refresh={refresh} />).toJSON()).toBeNull();
  });

  it('with no card: says so and offers only Add', () => {
    const r = render(<PaymentMethodRow view={{ enabled: true, hasCard: false }} refresh={refresh} />);
    expect(r.getByText(en.payment_method.none)).toBeTruthy();
    expect(r.getByText(en.payment_method.add)).toBeTruthy();
    expect(r.queryByTestId('payment-method-remove')).toBeNull();
  });

  it('with a card: shows last4, brand and expiry, with Replace and Remove', () => {
    const r = render(<PaymentMethodRow view={card} refresh={refresh} />);
    expect(r.getByTestId('payment-method-card').props.children).toBe('•••• 4242 · Visa · 03/29');
    expect(r.getByText(en.payment_method.replace)).toBeTruthy();
    expect(r.getByTestId('payment-method-remove')).toBeTruthy();
  });

  it('an invalid card says it cannot be charged', () => {
    const r = render(<PaymentMethodRow view={{ ...card, status: 'invalid' }} refresh={refresh} />);
    expect(r.getByTestId('payment-method-invalid')).toBeTruthy();
  });

  it('Add opens the provider page in the system browser, then refreshes', async () => {
    svc.createCardSaveSession.mockResolvedValue({ url: 'https://pay.example/save', sessionId: 'grow_1' });
    const r = render(<PaymentMethodRow view={{ enabled: true, hasCard: false }} refresh={refresh} />);
    await act(async () => { fireEvent.press(r.getByTestId('payment-method-add')); });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith('https://pay.example/save', 'bama://settings/payment');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('with the test provider the save is completed directly, no browser', async () => {
    svc.createCardSaveSession.mockResolvedValue({ url: 'https://fake-pay.invalid/x', sessionId: 'fake_u_1' });
    svc.fakeCompleteCardSave.mockResolvedValue({ ok: true });
    const r = render(<PaymentMethodRow view={{ enabled: true, hasCard: false }} refresh={refresh} />);
    await act(async () => { fireEvent.press(r.getByTestId('payment-method-add')); });
    expect(svc.fakeCompleteCardSave).toHaveBeenCalledWith({ token: 'tok_ok' });
    expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('a failed save toasts an error instead of failing silently', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    svc.createCardSaveSession.mockRejectedValue(new Error('nope'));
    const r = render(<PaymentMethodRow view={{ enabled: true, hasCard: false }} refresh={refresh} />);
    await act(async () => { fireEvent.press(r.getByTestId('payment-method-add')); });
    expect(mockToast).toHaveBeenCalledWith(en.payment_method.save_failed, 'error');
  });

  it('Remove asks first (not Alert.alert), then removes and refreshes', async () => {
    svc.removeMyPaymentMethod.mockResolvedValue({ ok: true });
    const r = render(<PaymentMethodRow view={card} refresh={refresh} />);
    await act(async () => { fireEvent.press(r.getByTestId('payment-method-remove')); });
    expect(confirmDialog).toHaveBeenCalled();
    expect(svc.removeMyPaymentMethod).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
  });

  it('declining the confirmation removes nothing', async () => {
    (confirmDialog as jest.Mock).mockResolvedValueOnce(false);
    const r = render(<PaymentMethodRow view={card} refresh={refresh} />);
    await act(async () => { fireEvent.press(r.getByTestId('payment-method-remove')); });
    expect(svc.removeMyPaymentMethod).not.toHaveBeenCalled();
  });

  it('speaks Hebrew with the fee called עמלת תיווך', () => {
    mockLang = 'he';
    const r = render(<PaymentMethodRow view={{ enabled: true, hasCard: false }} refresh={refresh} />);
    expect(r.getByText('אמצעי תשלום לעמלת תיווך')).toBeTruthy();
    expect(r.getByText('לא הוגדר כרטיס')).toBeTruthy();
    expect(r.getByText('הוסף')).toBeTruthy();
  });
});

describe('copy', () => {
  it('has every payment_method and charge_state key in both languages', () => {
    for (const k of Object.keys(en.payment_method)) expect((he.payment_method as Record<string, string>)[k]).toBeTruthy();
    for (const k of Object.keys(en.balance).filter((x) => x.startsWith('charge_state_') || x === 'card_note')) {
      expect((he.balance as Record<string, string>)[k]).toBeTruthy();
    }
    expect(he.balance.charge_state_idle).toBe('ממתין לחיוב');
    expect(he.balance.charge_state_succeeded).toBe('חויב');
    expect(he.balance.charge_state_failed).toBe('החיוב נכשל – נסה כרטיס אחר');
    expect(he.balance.charge_state_needs_card).toBe('נדרש כרטיס');
  });
  it('formats expiry as MM/YY', () => {
    expect(formatExpiry(3, 2029)).toBe('03/29');
    expect(formatExpiry(undefined, undefined)).toBe('');
  });
});
