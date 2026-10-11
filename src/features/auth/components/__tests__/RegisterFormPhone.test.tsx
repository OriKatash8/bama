import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { RegisterForm } from '../RegisterForm';
import en from '@core/i18n/translations/en.json';

/**
 * Registration offers a phone number. It is OPTIONAL (App Store 5.1.1(v)); when
 * given it is checked by format only, and what reaches useRegister is already
 * normalised to E.164 — or null when none was given.
 */

const mockRegister = jest.fn();
jest.mock('@features/auth/hooks/useRegister', () => ({
  useRegister: () => ({ isLoading: false, error: null, register: mockRegister }),
}));
jest.mock('../GoogleSignInButton', () => ({ GoogleSignInButton: () => null }));
jest.mock('../AppleSignInButton', () => ({ AppleSignInButton: () => null }));
jest.mock('../AuthSettingsButton', () => ({ AuthSettingsButton: () => null }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const a = en.auth;

async function fill(r: ReturnType<typeof render>, phone: string) {
  fireEvent.changeText(r.getByPlaceholderText(a.full_name), 'Dana Cohen');
  fireEvent.changeText(r.getByPlaceholderText(a.email), 'dana@example.com');
  fireEvent.changeText(r.getByPlaceholderText(a.phone_optional), phone);
  fireEvent.changeText(r.getByPlaceholderText(a.password), 'Str0ng!Passw0rd');
  fireEvent.changeText(r.getByPlaceholderText(a.confirm_password), 'Str0ng!Passw0rd');
  for (const box of r.getAllByRole('checkbox')) fireEvent.press(box);
  await act(async () => { fireEvent.press(r.getByText(a.create_account)); });
}

beforeEach(() => jest.clearAllMocks());

it('the phone field says it is optional, with a phone keypad and phone autofill', () => {
  const r = render(<RegisterForm />);
  const input = r.getByPlaceholderText(a.phone_optional);
  expect(input.props.keyboardType).toBe('phone-pad');
  expect(input.props.autoComplete).toBe('tel');
});

it('shows no email-fallback hint (that lives on the setup and Settings phone screens)', () => {
  const r = render(<RegisterForm />);
  expect(r.queryByTestId('phone-email-hint')).toBeNull();
  expect(r.queryByText(a.phone_email_fallback_hint)).toBeNull();
});

it('is optional: registers without one, passing null', async () => {
  const r = render(<RegisterForm />);
  await fill(r, '');
  expect(r.queryByText(a.err_phone_invalid)).toBeNull();
  expect(mockRegister).toHaveBeenCalledTimes(1);
  expect(mockRegister.mock.calls[0][4]).toBeNull();
});

it('rejects a number that is not a phone number', async () => {
  const r = render(<RegisterForm />);
  await fill(r, '12345');
  expect(r.getByText(a.err_phone_invalid)).toBeTruthy();
  expect(mockRegister).not.toHaveBeenCalled();
});

it('registers with the number normalised to E.164', async () => {
  const r = render(<RegisterForm />);
  await fill(r, '050-123-4567');
  expect(r.queryByText(a.err_phone_invalid)).toBeNull();
  expect(mockRegister).toHaveBeenCalledTimes(1);
  expect(mockRegister.mock.calls[0][4]).toBe('+972501234567');
});
