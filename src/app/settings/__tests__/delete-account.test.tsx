import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import DeleteAccountSettings from '../delete-account';
import en from '@core/i18n/translations/en.json';

/**
 * AFTER DELETING THEIR ACCOUNT, THE USER LANDS ON THE LOG-IN SCREEN.
 *
 * The screen used to sign out and trust "the auth listener" to route away — but
 * useAuth only clears the store on sign-out, and this route lives outside the
 * app groups, so nothing moved: the user was left on the delete screen of an
 * account that no longer existed. It now goes through useLogout, which signs out
 * and replaces to /(auth) (the log-in screen).
 */

const mockDelete = jest.fn();
const mockStatus = jest.fn();
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string) => (...a: unknown[]) => (name === 'deleteMyAccount' ? mockDelete(...a) : mockStatus(...a)),
}));
const mockLogout = jest.fn();
jest.mock('@features/auth/hooks/useLogout', () => ({ useLogout: () => ({ isLoading: false, logout: mockLogout }) }));
jest.mock('@core/firebase/auth', () => ({ signOut: jest.fn() }));
const mockToast = jest.fn();
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: typeof mockToast }) => unknown) => s({ showToast: mockToast }),
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({ back: jest.fn(), replace: jest.fn() }) }));
jest.mock('@components/layout/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const d = en.delete_account;

async function armAndDelete() {
  const r = render(<DeleteAccountSettings />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.changeText(r.getByTestId('delete-confirm-input'), d.confirm_word);
  await act(async () => { fireEvent.press(r.getByText(d.confirm_button)); });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.mockResolvedValue({ canDelete: true, blockers: [], outstandingFee: 0, outstandingFeeProjects: 0 });
  mockDelete.mockResolvedValue({ ok: true });
  mockLogout.mockResolvedValue(undefined);
});

it('deletes, says so, and sends the user to the log-in screen', async () => {
  await armAndDelete();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith(d.done, 'success');
  // useLogout's default destination is /(auth) — the log-in screen.
  expect(mockLogout).toHaveBeenCalledWith();
});

it('a failed deletion stays put and says so — no sign-out', async () => {
  mockDelete.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/internal' }));
  await armAndDelete();
  expect(mockToast).toHaveBeenCalledWith(d.failed, 'error');
  expect(mockLogout).not.toHaveBeenCalled();
});
