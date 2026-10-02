import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { FeeOverdueBanner } from '../FeeOverdueBanner';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/** The blocked professional's banner: what is owed, what is paused, how to settle. */

let mockLanguage = 'en';
const mockPush = jest.fn();
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('lucide-react-native', () => ({ AlertCircle: 'AlertCircle' }));

beforeEach(() => { mockLanguage = 'en'; mockPush.mockClear(); });

it('names the amount owed and how settlement happens', () => {
  const r = render(<FeeOverdueBanner amount={1250} />);
  expect(r.getByText(en.noticeboard.overdue_banner_title)).toBeTruthy();
  expect(r.getByText(en.noticeboard.overdue_banner_body.replace('{{amount}}', '1,250'))).toBeTruthy();
  expect(r.getByText(en.noticeboard.overdue_banner_how)).toBeTruthy();
});

it('links to the fee terms', () => {
  const r = render(<FeeOverdueBanner amount={10} />);
  fireEvent.press(r.getByText(en.noticeboard.overdue_banner_terms));
  expect(mockPush).toHaveBeenCalledWith('/settings/pricing');
});

it('in Hebrew: Hebrew copy, right-aligned', () => {
  mockLanguage = 'he';
  const r = render(<FeeOverdueBanner amount={10} />);
  const title = r.getByText(he.noticeboard.overdue_banner_title);
  expect(StyleSheet.flatten(title.props.style).textAlign).toBe('right');
});

it('keeps Heebo line heights at or above 1.47× the font size', () => {
  const r = render(<FeeOverdueBanner amount={10} />);
  for (const key of ['overdue_banner_title', 'overdue_banner_how', 'overdue_banner_terms'] as const) {
    const st = StyleSheet.flatten(r.getByText(en.noticeboard[key]).props.style);
    expect(st.lineHeight / st.fontSize).toBeGreaterThanOrEqual(1.47);
  }
});
