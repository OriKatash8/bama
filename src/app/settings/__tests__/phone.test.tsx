import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import PhoneSettings from '../phone';
import { useAuthStore } from '@core/stores/authStore';
import en from '@core/i18n/translations/en.json';

/**
 * The Settings phone screen: pre-filled, with back. The number is optional
 * (App Store 5.1.1(v)) — nothing sends anyone here, and an empty field with
 * nothing on file is nothing to save. A number given is validated and saved
 * normalised.
 */

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
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
const mockScreenProps: Record<string, unknown>[] = [];
jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children, ...props }: { children: React.ReactNode }) => { mockScreenProps.push(props); return children; },
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useModeAccent: () => ({ accent: '#1e4fa3', tint: '#E6EDFC' }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const p = en.phone_settings;

async function save(r: ReturnType<typeof render>, value: string) {
  fireEvent.changeText(r.getByPlaceholderText(en.auth.phone_optional), value);
  await act(async () => { fireEvent.press(r.getByText(p.save)); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue(undefined);
  mockCurrent = null;
  useAuthStore.setState({ user: { id: 'u1' } as never });
});

it('has back, says the number is optional, and starts from the current number', () => {
  mockCurrent = '+972501234567';
  const r = render(<PhoneSettings />);
  expect(r.getByTestId('phone-back')).toBeTruthy();
  expect(r.getByText(p.edit_explain)).toBeTruthy();
  expect(r.getByPlaceholderText(en.auth.phone_optional).props.value).toBe('050-123-4567');
  expect(r.getByText(en.auth.phone_email_fallback_hint)).toBeTruthy();
});

it('saves, says so, and goes back', async () => {
  mockCurrent = '+972501234567';
  const r = render(<PhoneSettings />);
  await save(r, '+1 415 555 2671');
  expect(mockSave).toHaveBeenCalledWith('u1', '+14155552671');
  expect(mockToast).toHaveBeenCalledWith(p.saved, 'success');
  expect(mockBack).toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

it('marks the number as on file once saved', async () => {
  useAuthStore.setState({ hasPhone: false });
  const r = render(<PhoneSettings />);
  await save(r, '054-111-2222');
  expect(mockSave).toHaveBeenCalledWith('u1', '+972541112222');
  expect(useAuthStore.getState().hasPhone).toBe(true);
});

it('refuses a number that is not a phone number', async () => {
  const r = render(<PhoneSettings />);
  await save(r, '123');
  expect(r.getByText(en.auth.err_phone_invalid)).toBeTruthy();
  expect(mockSave).not.toHaveBeenCalled();
});

it('with no number on file, an empty field just goes back — nothing saved, no error', async () => {
  const r = render(<PhoneSettings />);
  await save(r, '');
  expect(mockSave).not.toHaveBeenCalled();
  expect(r.queryByText(en.auth.err_phone_invalid)).toBeNull();
  expect(mockBack).toHaveBeenCalled();
});

it('a saved number cannot be cleared (the rules forbid deleting it)', async () => {
  mockCurrent = '+972501234567';
  const r = render(<PhoneSettings />);
  await save(r, '');
  expect(mockSave).not.toHaveBeenCalled();
  expect(r.getByText(en.auth.err_phone_invalid)).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled();
});

it('says so when the save fails, and stays', async () => {
  mockSave.mockRejectedValue(new Error('offline'));
  const r = render(<PhoneSettings />);
  await save(r, '0501234567');
  expect(mockToast).toHaveBeenCalledWith(p.error, 'error');
  expect(mockBack).not.toHaveBeenCalled();
});

describe('look', () => {
  beforeEach(() => { mockScreenProps.length = 0; });

  it('white page, grey card, black text', () => {
    const r = render(<PhoneSettings />);
    expect(mockScreenProps[mockScreenProps.length - 1].backgroundColor).toBe('#FFFFFF');
    expect(StyleSheet.flatten(r.getByTestId('phone-card').props.style).backgroundColor).toBe(GREY);
    expect(StyleSheet.flatten(r.getByText(p.title).props.style).color).toBe(BLACK);
    expect(StyleSheet.flatten(r.getByText(p.edit_explain).props.style).color).toBe(BLACK);
  });
});

const GREY = '#F2F2F5';
const BLACK = '#000000';
