import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import ClientOnboardingScreen from '../onboarding';
import { useAuthStore } from '@core/stores/authStore';
import { savePhone } from '@features/auth/services/phoneService';
import { updateDocument } from '@core/firebase/firestore';

/**
 * The client's name-and-picture page offers the phone number too, when the
 * account has none yet (Apple / Google sign-ups). It is optional (App Store
 * 5.1.1(v)): Continue needs only the name, and a number given must be valid.
 * Someone who gave it on the register form is not asked again.
 */

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@core/firebase/storage', () => ({ uploadFile: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({ updateDocument: jest.fn(async () => undefined) }));
jest.mock('@features/auth/services/phoneService', () => ({ savePhone: jest.fn(async () => undefined) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const O = en.client_onboarding;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'u1', displayName: 'Noa Levi', photoURL: null, termsVersion: '1.0' } as never,
    hasPhone: false,
  });
});

const continueBtn = (r: ReturnType<typeof render>) => r.getByTestId('onboarding-continue');

it('no number yet: offers it, labelled optional', () => {
  const r = render(<ClientOnboardingScreen />);
  expect(r.getByText(en.auth.phone_optional)).toBeTruthy();
  expect(r.getByTestId('setup-phone').props.keyboardType).toBe('phone-pad');
});

it('continues with the name only, saving no number', async () => {
  const r = render(<ClientOnboardingScreen />);
  expect(continueBtn(r).props.accessibilityState.disabled).toBe(false);
  await act(async () => { fireEvent.press(continueBtn(r)); });
  expect(savePhone).not.toHaveBeenCalled();
  expect(updateDocument).toHaveBeenCalledWith('users/u1', expect.objectContaining({ displayName: 'Noa Levi', clientOnboarded: true }));
  expect(useAuthStore.getState().hasPhone).toBe(false);
  expect(mockReplace).toHaveBeenCalledWith('/(client)/(tabs)/home');
});

it('a number that is given must be valid', async () => {
  const r = render(<ClientOnboardingScreen />);
  fireEvent.changeText(r.getByTestId('setup-phone'), '12');
  expect(continueBtn(r).props.accessibilityState.disabled).toBe(true);
  await act(async () => { fireEvent.press(continueBtn(r)); });
  expect(savePhone).not.toHaveBeenCalled();
  expect(updateDocument).not.toHaveBeenCalled();
});

it('saves the number with the name, then goes home', async () => {
  const r = render(<ClientOnboardingScreen />);
  fireEvent.changeText(r.getByTestId('setup-phone'), '050-123-4567');
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
  expect(r.queryByTestId('setup-phone')).toBeNull();
  await act(async () => { fireEvent.press(continueBtn(r)); });
  expect(savePhone).not.toHaveBeenCalled();
  expect(updateDocument).toHaveBeenCalled();
});

it('keeps its own title', () => {
  const r = render(<ClientOnboardingScreen />);
  expect(r.getByText(O.title)).toBeTruthy();
});
