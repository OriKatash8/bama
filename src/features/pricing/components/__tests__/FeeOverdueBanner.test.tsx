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

it('has a pay-now button to the balance screen, and no longer says settlement is outside the app', () => {
  const r = render(<FeeOverdueBanner amount={10} />);
  fireEvent.press(r.getByTestId('fee-banner-pay'));
  expect(mockPush).toHaveBeenCalledWith('/settings/payment');
  expect(en.noticeboard.overdue_banner_how).not.toMatch(/outside the app/i);
  expect(he.noticeboard.overdue_banner_how).not.toContain('מחוץ לאפליקציה');
});

it('warning mode: amount and the pay-by date, existing projects keep going, pay-now present', () => {
  const at = new Date(2026, 10, 19, 12).getTime();
  const r = render(<FeeOverdueBanner mode="warning" amount={1250} blockAt={at} />);
  expect(r.getByTestId('fee-warning-banner')).toBeTruthy();
  expect(r.getByText(en.noticeboard.overdue_warning_title)).toBeTruthy();
  expect(r.getByText(
    en.noticeboard.overdue_warning_body.replace('{{amount}}', '1,250').replace('{{date}}', '19/11/2026'),
  )).toBeTruthy();
  fireEvent.press(r.getByTestId('fee-banner-pay'));
  expect(mockPush).toHaveBeenCalledWith('/settings/payment');
});

it('warning mode in Hebrew uses the Hebrew copy and the same date format', () => {
  mockLanguage = 'he';
  const at = new Date(2026, 10, 19, 12).getTime();
  const r = render(<FeeOverdueBanner mode="warning" amount={10} blockAt={at} />);
  expect(r.getByText(
    he.noticeboard.overdue_warning_body.replace('{{amount}}', '10').replace('{{date}}', '19/11/2026'),
  )).toBeTruthy();
});

it('unpaid mode (block switch off): amount + pay now, no date, no restriction or threat, in both languages', () => {
  const forbiddenEn = /block|restrict|paus|won't be able|can't send|overdue|\d{2}\/\d{2}\/\d{4}/i;
  const forbiddenHe = /חסימ|הגבל|מושה|לא ניתן|באיחור|\d{2}\/\d{2}\/\d{4}/;
  const r = render(<FeeOverdueBanner mode="unpaid" amount={1250} />);
  expect(r.getByTestId('fee-unpaid-banner')).toBeTruthy();
  const enTexts = [en.noticeboard.overdue_unpaid_title, en.noticeboard.overdue_unpaid_body, en.noticeboard.overdue_unpaid_how];
  expect(r.getByText(en.noticeboard.overdue_unpaid_body.replace('{{amount}}', '1,250'))).toBeTruthy();
  for (const t of enTexts) expect(t).not.toMatch(forbiddenEn);
  const heTexts = [he.noticeboard.overdue_unpaid_title, he.noticeboard.overdue_unpaid_body, he.noticeboard.overdue_unpaid_how];
  for (const t of heTexts) expect(t).not.toMatch(forbiddenHe);
  fireEvent.press(r.getByTestId('fee-banner-pay'));
  expect(mockPush).toHaveBeenCalledWith('/settings/payment');
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
  for (const key of ['overdue_banner_title', 'overdue_banner_how', 'overdue_banner_terms', 'overdue_banner_pay'] as const) {
    const st = StyleSheet.flatten(r.getByText(en.noticeboard[key]).props.style);
    expect(st.lineHeight / st.fontSize).toBeGreaterThanOrEqual(1.47);
  }
});
