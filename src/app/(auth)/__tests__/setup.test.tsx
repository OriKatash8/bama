import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import ProfileSetupScreen from '../setup';
import { useAuthStore } from '@core/stores/authStore';
import { savePhone } from '@features/auth/services/phoneService';
import { updateDocument } from '@core/firebase/firestore';

/**
 * FIRST-TIME SETUP: right after the email is verified (or consent given, for
 * Apple), a new account fills in its name, picture and — if it has none —
 * phone, THEN chooses client or professional.
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
jest.mock('@features/auth/hooks/usePhoneGate', () => ({ usePhoneGate: jest.fn(() => false) }));
let mockLang = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    user: { id: 'u1', displayName: 'Noa Levi', photoURL: null, termsVersion: '1.0', needsProfileSetup: true } as never,
    hasPhone: true,
  });
});

it('saves the name, clears the flag, then goes to mode select', async () => {
  const r = render(<ProfileSetupScreen />);
  await act(async () => { fireEvent.press(r.getByTestId('onboarding-continue')); });
  expect(updateDocument).toHaveBeenCalledWith('users/u1', expect.objectContaining({
    displayName: 'Noa Levi', clientOnboarded: true, needsProfileSetup: false,
  }));
  expect(useAuthStore.getState().user?.needsProfileSetup).toBe(false);
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/mode-select');
});

it('no number yet (Apple sign-up): asks for it here', async () => {
  useAuthStore.setState({ hasPhone: false });
  const r = render(<ProfileSetupScreen />);
  fireEvent.changeText(r.getByTestId('setup-phone'), '050-123-4567');
  await act(async () => { fireEvent.press(r.getByTestId('onboarding-continue')); });
  expect(savePhone).toHaveBeenCalledWith('u1', '+972501234567');
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/mode-select');
});

it('someone who has already done it is sent on, not shown the page again', () => {
  useAuthStore.setState({ user: { id: 'u1', displayName: 'N', photoURL: null, termsVersion: '1.0' } as never });
  render(<ProfileSetupScreen />);
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/mode-select');
});

describe('the look: the client home page\'s — white page, black text, blue button', () => {
  const { StyleSheet } = jest.requireActual('react-native');
  const flat = (el: { props: { [k: string]: unknown } }) => StyleSheet.flatten(el.props.style);

  it('white page, black title, grey subtitle', () => {
    const r = render(<ProfileSetupScreen />);
    expect(flat(r.getByTestId('setup-page')).backgroundColor).toBe('#FFFFFF');
    expect(flat(r.getByText(en.client_onboarding.title)).color).toBe('#16132B');
    expect(flat(r.getByText(en.client_onboarding.setup_subtitle)).color).toBe('#5B5870');
  });

  it('the Continue button is solid blue, and a paler blue until it can be pressed', () => {
    const r = render(<ProfileSetupScreen />);
    expect(flat(r.getByTestId('onboarding-continue')).backgroundColor).toBe('#004aad');
    fireEvent.changeText(r.getByTestId('setup-name'), '  ');
    expect(flat(r.getByTestId('onboarding-continue')).backgroundColor).not.toBe('#004aad');
  });

  it('the name is its own labelled field, and so is the phone when asked', () => {
    useAuthStore.setState({ hasPhone: false });
    const r = render(<ProfileSetupScreen />);
    expect(r.getByText(en.client_onboarding.name_label)).toBeTruthy();
    expect(r.getByTestId('setup-name').props.value).toBe('Noa Levi');
    expect(r.getByTestId('setup-phone').props.keyboardType).toBe('phone-pad');
  });

  it('Hebrew: the text is right-aligned', () => {
    mockLang = 'he';
    const r = render(<ProfileSetupScreen />);
    expect(flat(r.getByText(he.client_onboarding.title)).textAlign).toBe('right');
    expect(flat(r.getByTestId('setup-name')).textAlign).toBe('right');
    mockLang = 'en';
  });
});
