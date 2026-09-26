import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import PhoneSettings from '../phone';
import { useAuthStore } from '@core/stores/authStore';
import en from '@core/i18n/translations/en.json';

/**
 * One screen, two uses. `?required=1`: the gate for a signed-in user with no
 * number — no way back, and saving continues into the app. Without it: the
 * Settings edit screen, pre-filled, with back. Both validate the same way and
 * save the same normalised number.
 */

let mockRequired: string | undefined;
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => ({ required: mockRequired }),
}));
const mockSave = jest.fn();
let mockCurrent: string | null = null;
jest.mock('@features/auth/services/phoneService', () => ({
  savePhone: (...a: unknown[]) => mockSave(...a),
  subscribePhone: (_u: string, cb: (p: string | null) => void) => { cb(mockCurrent); return () => {}; },
}));
const mockToast = jest.fn();
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: typeof mockToast }) => unknown) => s({ showToast: mockToast }),
}));
jest.mock('@components/layout/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useModeAccent: () => ({ accent: '#1e4fa3', tint: '#E6EDFC' }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const p = en.phone_settings;

async function save(r: ReturnType<typeof render>, value: string) {
  fireEvent.changeText(r.getByPlaceholderText(en.auth.phone), value);
  await act(async () => { fireEvent.press(r.getByText(p.save)); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue(undefined);
  mockCurrent = null;
  useAuthStore.setState({ user: { id: 'u1' } as never });
});

describe('required (the gate)', () => {
  beforeEach(() => { mockRequired = '1'; });

  it('explains why, and offers no way back', () => {
    const r = render(<PhoneSettings />);
    expect(r.getByText(p.required_explain)).toBeTruthy();
    expect(r.queryByTestId('phone-back')).toBeNull();
  });

  it('refuses a number that is not a phone number', async () => {
    const r = render(<PhoneSettings />);
    await save(r, '123');
    expect(r.getByText(en.auth.err_phone_invalid)).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('saves the normalised number and continues into the app', async () => {
    const r = render(<PhoneSettings />);
    await save(r, '054-111-2222');
    expect(mockSave).toHaveBeenCalledWith('u1', '+972541112222');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('lifts the gate as it leaves — or the layout would bounce straight back here', async () => {
    // Nothing is listening while this screen is up (the group layout is not
    // mounted), so the store still says "no number" until the save says otherwise.
    useAuthStore.setState({ hasPhone: false });
    const r = render(<PhoneSettings />);
    await save(r, '054-111-2222');
    expect(useAuthStore.getState().hasPhone).toBe(true);
  });
});

describe('from Settings (edit)', () => {
  beforeEach(() => { mockRequired = undefined; });

  it('has back, and starts from the current number', () => {
    mockCurrent = '+972501234567';
    const r = render(<PhoneSettings />);
    expect(r.getByTestId('phone-back')).toBeTruthy();
    expect(r.getByPlaceholderText(en.auth.phone).props.value).toBe('050-123-4567');
  });

  it('saves, says so, and goes back', async () => {
    mockCurrent = '+972501234567';
    const r = render(<PhoneSettings />);
    await save(r, '+1 415 555 2671');
    expect(mockSave).toHaveBeenCalledWith('u1', '+14155552671');
    expect(mockToast).toHaveBeenCalledWith(p.saved, 'success');
    expect(mockBack).toHaveBeenCalled();
  });

  it('says so when the save fails, and stays', async () => {
    mockSave.mockRejectedValue(new Error('offline'));
    const r = render(<PhoneSettings />);
    await save(r, '0501234567');
    expect(mockToast).toHaveBeenCalledWith(p.error, 'error');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
