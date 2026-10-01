import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ContactScreen from '../contact';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { BAMA_CONTACT_EMAIL, BAMA_WHATSAPP_NUMBER } from '@core/constants/contact';

/**
 * "Contact us" (settings menu): BAMA's email and WhatsApp, and that we answer
 * as fast as we can. Each opens the right app.
 */

let mockLanguage = 'en';
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useSegments: () => [] }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@components/layout/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));

const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
beforeEach(() => { jest.clearAllMocks(); mockLanguage = 'en'; });

it('uses the business email and WhatsApp number', () => {
  expect(BAMA_CONTACT_EMAIL).toBe('bama.app.hk@gmail.com');
  expect(BAMA_WHATSAPP_NUMBER).toBe('+972529710467');
});

it('shows the title, the reply promise, the email and the number', () => {
  const r = render(<ContactScreen />);
  expect(r.getByText(en.contact.title)).toBeTruthy();
  expect(r.getByText(en.contact.reply_note)).toBeTruthy();
  expect(r.getByText('bama.app.hk@gmail.com')).toBeTruthy();
  expect(r.getByText('+972 52-971-0467')).toBeTruthy();
});

it('the email opens a new email to BAMA', () => {
  const r = render(<ContactScreen />);
  fireEvent.press(r.getByText('bama.app.hk@gmail.com'));
  expect(openURL).toHaveBeenCalledWith('mailto:bama.app.hk@gmail.com');
});

it('the number opens a WhatsApp chat with BAMA', () => {
  const r = render(<ContactScreen />);
  fireEvent.press(r.getByText('+972 52-971-0467'));
  expect(openURL).toHaveBeenCalledWith('https://wa.me/972529710467');
});

it('reads in Hebrew, with the number kept left-to-right', () => {
  mockLanguage = 'he';
  const r = render(<ContactScreen />);
  expect(r.getByText(he.contact.title)).toBeTruthy();
  expect(r.getByText(he.contact.reply_note)).toBeTruthy();
  const num = r.getByText('+972 52-971-0467');
  expect(require('react-native').StyleSheet.flatten(num.props.style).writingDirection).toBe('ltr');
});
