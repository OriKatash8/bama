import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ProjectDetailModal } from '../ProjectDetailModal';
import en from '@core/i18n/translations/en.json';
import { confirmDialog } from '@utils/confirmDialog';

/**
 * A professional with an overdue fee who tries to send an offer is told why,
 * through confirmDialog (Alert.alert no-ops on web) — never a silent failure.
 * The server (the offer create rule) is what actually refuses; this is the
 * explanation in front of it, and the reading of its refusal behind it.
 */

const mockSubmit = jest.fn();
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@features/noticeboard/hooks/usePriceOffer', () => ({
  usePriceOffer: () => ({ submit: mockSubmit, submitWithBundle: jest.fn(), isSubmitting: false }),
}));
jest.mock('@features/pricing/hooks/usePricingConfig', () => ({
  usePricingConfig: () => ({ feePercent: 3, minFeeAmount: 6, chargeWindowDays: 4 }),
}));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn(() => Promise.resolve(false)) }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), doc: jest.fn(), getDoc: jest.fn(), getDocs: jest.fn(),
  onSnapshot: jest.fn(() => () => {}), query: jest.fn(), where: jest.fn(),
  orderBy: jest.fn(), limit: jest.fn(), updateDoc: jest.fn(), serverTimestamp: jest.fn(),
}));

const confirm = confirmDialog as jest.Mock;
const NB = en.noticeboard;

const request = {
  id: 'req-1', title: 'Three-camera shoot', description: 'A launch film.',
  exec: '2099-01-15', deadline: '2099-02-20', location: 'Tel Aviv',
  crewSlots: [{ category: 'Video Photographer', quantity: 1 }], filledSlots: [], roleAnswers: {},
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

const onTerms = jest.fn();
const overdue = (over: Partial<{ blocked: boolean; amount: number; from: number | null }> = {}) => ({
  blocked: true, amount: 120, from: Date.now() - 1000, onTerms, ...over,
});

async function bidAndSubmit(r: ReturnType<typeof render>) {
  act(() => { fireEvent(r.getByRole('switch'), 'valueChange', true); });
  act(() => { fireEvent.changeText(r.getByPlaceholderText('₪'), '1000'); });
  await act(async () => { fireEvent.press(r.getByText(/^Submit Offer \(1/)); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSubmit.mockResolvedValue(undefined);
  confirm.mockResolvedValue(false);
});

it('an overdue professional is told why, and no offer is written', async () => {
  const r = render(<ProjectDetailModal {...base} initialView="bid" feeOverdue={overdue()} />);
  await bidAndSubmit(r);
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledWith(
    NB.overdue_dialog_title,
    NB.overdue_dialog_body.replace('{{amount}}', '120'),
    { confirm: NB.overdue_dialog_terms, cancel: NB.overdue_dialog_close, destructive: false },
  );
});

it('"Fee terms" in the dialog leaves the modal for the terms', async () => {
  confirm.mockResolvedValue(true);
  const r = render(<ProjectDetailModal {...base} initialView="bid" feeOverdue={overdue()} />);
  await bidAndSubmit(r);
  expect(base.onClose).toHaveBeenCalled();
  expect(onTerms).toHaveBeenCalled();
});

it('an unblocked professional submits normally', async () => {
  const r = render(<ProjectDetailModal {...base} initialView="bid" feeOverdue={overdue({ blocked: false, from: null })} />);
  await bidAndSubmit(r);
  expect(mockSubmit).toHaveBeenCalledWith('req-1', [{ category: 'Video Photographer', price: 1000 }]);
  expect(confirm).not.toHaveBeenCalled();
  expect(base.onApply).toHaveBeenCalled();
});

it('a rules refusal from a professional with a known block time is explained as the block', async () => {
  // The device clock a moment behind the server's: the mirror says not yet, the rule says now.
  mockSubmit.mockRejectedValue({ code: 'permission-denied' });
  const r = render(<ProjectDetailModal {...base} initialView="bid" feeOverdue={overdue({ blocked: false, from: Date.now() + 500 })} />);
  await bidAndSubmit(r);
  expect(mockSubmit).toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledWith(NB.overdue_dialog_title, expect.any(String), expect.anything());
});

it('a refusal from a professional with no overdue fee is not blamed on one', async () => {
  mockSubmit.mockRejectedValue({ code: 'permission-denied' });
  const r = render(<ProjectDetailModal {...base} initialView="bid" feeOverdue={overdue({ blocked: false, from: null })} />);
  await bidAndSubmit(r);
  expect(confirm).not.toHaveBeenCalled();
});
