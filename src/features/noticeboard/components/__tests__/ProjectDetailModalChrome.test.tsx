import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ProjectDetailModal } from '../ProjectDetailModal';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * THE OFFER MODAL'S CHROME AND COPY.
 *
 * Blue ring, black copy, dates written the way the client's home builder writes
 * them, and every line following the language. The Hebrew fee sentence used to
 * sit left while the rows around it mirrored, and the dates were printed as the
 * raw ISO strings they are stored as.
 */

const BLUE = '#004aad';
const INK = '#000000';

let mockLanguage = 'en';
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@features/noticeboard/hooks/usePriceOffer', () => ({
  usePriceOffer: () => ({ submit: jest.fn(), submitWithBundle: jest.fn(), isSubmitting: false }),
}));
jest.mock('@features/pricing/hooks/usePricingConfig', () => ({
  usePricingConfig: () => ({ feePercent: 3, minFee: 6, chargeWindowDays: 14 }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
// useNoticeboard is imported for getVacantSlots (a pure helper) but drags
// Firestore's ESM build in behind it.
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), getDoc: jest.fn(), getDocs: jest.fn(),
  onSnapshot: jest.fn(() => () => {}), query: jest.fn(), where: jest.fn(),
  orderBy: jest.fn(), limit: jest.fn(), updateDoc: jest.fn(), serverTimestamp: jest.fn(),
}));

const request = {
  id: 'req-1',
  title: 'Three-camera shoot',
  description: 'A launch film.',
  exec: '2099-01-15',
  deadline: '2099-02-20',
  location: 'Tel Aviv',
  crewSlots: [{ category: 'Video Photographer', quantity: 1 }],
  filledSlots: [],
  roleAnswers: {},
} as never;

const base = {
  request,
  onClose: jest.fn(),
  onApply: jest.fn(),
  onDismiss: jest.fn(),
  professionalCategories: ['Video Photographer'],
  roleSkills: [{ role: 'videographer', specializations: ['general'] }] as never,
  isApplying: false,
};

beforeEach(() => { mockLanguage = 'en'; });

/** The outermost card is the one node carrying a 3pt ring. */
function cardBorder(r: ReturnType<typeof render>) {
  const match = r.root.findAll((n) => {
    const s = StyleSheet.flatten(n.props?.style) as { borderWidth?: number; borderColor?: string } | undefined;
    return s?.borderWidth === 3 && typeof s.borderColor === 'string';
  });
  return (StyleSheet.flatten(match[0].props.style) as { borderColor: string }).borderColor;
}

it('rings the card in blue, not magenta', () => {
  const r = render(<ProjectDetailModal {...base} />);
  expect(cardBorder(r)).toBe(BLUE);
});

it('writes the dates dd/mm/yyyy, as the client home builder does', () => {
  const r = render(<ProjectDetailModal {...base} />);

  expect(r.getByText('15/01/2099')).toBeTruthy();
  expect(r.getByText('20/02/2099')).toBeTruthy();
  expect(r.queryByText('2099-01-15')).toBeNull();
  expect(r.queryByText('2099-02-20')).toBeNull();
});

it('writes the title and the section labels in black', () => {
  const r = render(<ProjectDetailModal {...base} />);

  for (const node of [
    r.getByText('Three-camera shoot'),
    r.getByText(en.noticeboard.description_label),
    r.getByText('A launch film.'),
    r.getByText('15/01/2099'),
  ]) {
    expect((StyleSheet.flatten(node.props.style) as { color?: string }).color).toBe(INK);
  }
});

it('lays the Hebrew copy out to the right', () => {
  mockLanguage = 'he';
  const r = render(<ProjectDetailModal {...base} />);

  for (const node of [
    r.getByText(he.noticeboard.description_label),
    r.getByText('A launch film.'),
    r.getByText('15/01/2099'),
  ]) {
    expect((StyleSheet.flatten(node.props.style) as { textAlign?: string }).textAlign).toBe('right');
  }
});

it('names the charge "Brokerage fee" and stops there', () => {
  const r = render(<ProjectDetailModal {...base} initialView="bid" />);

  // The fee line only appears once there is an amount to charge on, so the
  // row is selected and priced first.
  act(() => { fireEvent(r.getByRole('switch'), 'valueChange', true); });
  act(() => { fireEvent.changeText(r.getByPlaceholderText('₪'), '1000'); });

  // The amount still follows; only the "for this project" tail is gone.
  expect(r.getByText(/^Brokerage fee: ₪/)).toBeTruthy();
  expect(r.queryByText(/Platform fee/i)).toBeNull();
  expect(r.queryByText(/for this project/i)).toBeNull();
  expect(r.queryByText(/BAMA/i)).toBeNull();
});
