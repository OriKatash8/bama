import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { RegisterForm } from '../RegisterForm';
import en from '@core/i18n/translations/en.json';

/**
 * Registration asks for a phone number. It is REQUIRED and checked by format
 * only; what reaches useRegister is already normalised to E.164.
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
  fireEvent.changeText(r.getByPlaceholderText(a.phone), phone);
  fireEvent.changeText(r.getByPlaceholderText(a.password), 'Str0ng!Passw0rd');
  fireEvent.changeText(r.getByPlaceholderText(a.confirm_password), 'Str0ng!Passw0rd');
  for (const box of r.getAllByRole('checkbox')) fireEvent.press(box);
  await act(async () => { fireEvent.press(r.getByText(a.create_account)); });
}

beforeEach(() => jest.clearAllMocks());

it('the phone field is a phone keypad with phone autofill', () => {
  const r = render(<RegisterForm />);
  const input = r.getByPlaceholderText(a.phone);
  expect(input.props.keyboardType).toBe('phone-pad');
  expect(input.props.autoComplete).toBe('tel');
});

it('is required', async () => {
  const r = render(<RegisterForm />);
  await fill(r, '');
  expect(r.getByText(a.err_phone_invalid)).toBeTruthy();
  expect(mockRegister).not.toHaveBeenCalled();
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
