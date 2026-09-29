import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import ClientOnboardingScreen from '../onboarding';
import { useAuthStore } from '@core/stores/authStore';
import { savePhone } from '@features/auth/services/phoneService';
import { updateDocument } from '@core/firebase/firestore';

/**
 * The client's name-and-picture page asks for the phone number too, when the
 * account has none yet (Apple / Google sign-ups): one page instead of a
 * separate phone screen first. Someone who gave it on the register form is
 * not asked again.
 */

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({ updateDocument: jest.fn(async () => undefined) }));
jest.mock('@features/auth/services/phoneService', () => ({ savePhone: jest.fn(async () => undefined) }));
jest.mock('@features/profile/components/ProfileHeader', () => ({ ProfileHeader: () => null }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const A = en.auth;
const O = en.client_onboarding;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'u1', displayName: 'Noa Levi', photoURL: null, termsVersion: '1.0' } as never,
    hasPhone: false,
  });
});

const continueBtn = (r: ReturnType<typeof render>) => r.getByTestId('onboarding-continue');

it('no number yet: asks for it, and cannot continue without a valid one', async () => {
  const r = render(<ClientOnboardingScreen />);
  const input = r.getByPlaceholderText(A.phone);
  expect(input.props.keyboardType).toBe('phone-pad');
  expect(continueBtn(r).props.accessibilityState.disabled).toBe(true);

  fireEvent.changeText(input, '12');
  await act(async () => { fireEvent.press(continueBtn(r)); });
  expect(savePhone).not.toHaveBeenCalled();
  expect(updateDocument).not.toHaveBeenCalled();
});

it('saves the number with the name, then goes home', async () => {
  const r = render(<ClientOnboardingScreen />);
  fireEvent.changeText(r.getByPlaceholderText(A.phone), '050-123-4567');
  expect(continueBtn(r).props.accessibilityState.disabled).toBe(false);
  await act(async () => { fireEvent.press(continueBtn(r)); });

  expect(savePhone).toHaveBeenCalledWith('u1', '+972501234567');
  expect(updateDocument).toHaveBeenCalledWith('users/u1', expect.objectContaining({ displayName: 'Noa Levi', clientOnboarded: true }));
  expect(useAuthStore.getState().hasPhone).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/home');
});

it('already has a number (from the register form): not asked again', async () => {
  useAuthStore.setState({ hasPhone: true });
  const r = render(<ClientOnboardingScreen />);
  expect(r.queryByPlaceholderText(A.phone)).toBeNull();
  await act(async () => { fireEvent.press(continueBtn(r)); });
  expect(savePhone).not.toHaveBeenCalled();
  expect(updateDocument).toHaveBeenCalled();
});

it('keeps its own title', () => {
  const r = render(<ClientOnboardingScreen />);
  expect(r.getByText(O.title)).toBeTruthy();
});
