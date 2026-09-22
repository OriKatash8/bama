import React from 'react';
import { render } from '@testing-library/react-native';
import { CompleteEngagementSheet } from '../CompleteEngagementSheet';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * WHAT THE "I HAVE FINISHED MY PART" SHEET SAYS.
 *
 * Two deliberate facts about its copy:
 *  - the fee is named for what it is, a brokerage fee, not for the company;
 *  - it does not close with a line about where everyone else on the project
 *    stands. That was noise on a screen whose job is to state one charge.
 */

let mockLanguage = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@features/pricing/hooks/usePricingConfig', () => ({
  usePricingConfig: () => ({ chargeWindowDays: 14, feeRate: 0.03, minFee: 6 }),
}));

const base = {
  visible: true,
  projectTitle: 'Three-camera shoot',
  fee: { feeStatus: 'owed', baseAmount: 1000, feeRate: 0.03, minFeeApplied: 0, paidAmount: 0 } as never,
  submitting: false,
  onConfirm: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => { mockLanguage = 'en'; });

it('calls the charge a brokerage fee, and never names the company', () => {
  const r = render(<CompleteEngagementSheet {...base} />);

  expect(r.getByText(/Brokerage fee/)).toBeTruthy();
  expect(r.queryByText(/BAMA/i)).toBeNull();
});

it('says the same in Hebrew', () => {
  mockLanguage = 'he';
  const r = render(<CompleteEngagementSheet {...base} />);

  expect(r.getByText(new RegExp(he.engagement.complete_fee.split(' ·')[0]))).toBeTruthy();
  expect(r.queryByText(/BAMA/i)).toBeNull();
});

it('does not close with a line about the rest of the project', () => {
  const r = render(<CompleteEngagementSheet {...base} />);

  expect(r.queryByText(/Everyone else on the project/i)).toBeNull();
  // The line it DOES end on is the one that matters: the contest window.
  expect(r.getByText(en.engagement.complete_contest_note.replace('{{days}}', '14'))).toBeTruthy();
});
