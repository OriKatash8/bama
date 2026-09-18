import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ProjectsPage from '../index';
import { confirmDialog } from '@utils/confirmDialog';
import en from '@core/i18n/translations/en.json';

/**
 * Accept hires and Deny discards, and the two sit side by side on every offer
 * card. Each asks first; nothing happens unless the client confirms.
 */

const mockAccept = jest.fn(() => Promise.resolve());
const mockReject = jest.fn(() => Promise.resolve());
const mockAcceptBundle = jest.fn(() => Promise.resolve());
const mockRejectBundle = jest.fn(() => Promise.resolve());

jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(client)'],
}));
jest.mock('@components/layout/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@components/ui/EmptyState', () => ({ EmptyState: () => null }));
jest.mock('@features/crew/components', () => ({ ProjectRequestCard: () => null }));
jest.mock('@features/crew/hooks', () => ({ useProjectRequests: () => ({ requests: [], isLoading: false }) }));
// Stand-in cards: just the two buttons, wired to the screen's handlers.
jest.mock('@features/offers/components/PriceOfferCard', () => {
  const { Text: T } = require('react-native');
  return {
    PriceOfferCard: ({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) => (
      <>
        <T onPress={onAccept}>price-accept</T>
        <T onPress={onReject}>price-deny</T>
      </>
    ),
  };
});
jest.mock('@features/offers/components/BundleOfferCard', () => {
  const { Text: T } = require('react-native');
  return {
    BundleOfferCard: ({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) => (
      <>
        <T onPress={onAccept}>bundle-accept</T>
        <T onPress={onReject}>bundle-deny</T>
      </>
    ),
  };
});
jest.mock('@features/offers/hooks/usePriceOffers', () => ({
  usePriceOffers: () => ({
    offers: [{
      id: 'o1', projectId: 'p1', professionalId: 'pro', category: 'Editor', price: 1200,
      status: 'pending', createdAt: { seconds: 10, nanoseconds: 0 },
    }],
    isLoading: false,
  }),
}));
jest.mock('@features/offers/hooks/useBundleOffers', () => ({
  useBundleOffers: () => ({
    bundles: [{
      id: 'b1', projectId: 'p1', professionalId: 'pro', slots: [], individualTotal: 3000, bundlePrice: 2500,
      offerIds: [], status: 'pending', createdAt: { seconds: 5, nanoseconds: 0 },
    }],
    isLoading: false,
  }),
}));
jest.mock('@features/offers/hooks/useAcceptOffer', () => ({
  useAcceptOffer: () => ({ accept: mockAccept, reject: mockReject, isAccepting: null }),
}));
jest.mock('@features/offers/hooks/useAcceptBundleOffer', () => ({
  useAcceptBundleOffer: () => ({ acceptBundle: mockAcceptBundle, rejectBundle: mockRejectBundle, isAccepting: null }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(() => Promise.resolve(null)) }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: jest.fn() }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

const mockConfirm = confirmDialog as jest.MockedFunction<typeof confirmDialog>;

async function openOffers() {
  const r = render(<ProjectsPage />);
  await act(async () => { fireEvent.press(r.getByRole('button', { name: en.chats_page.price_offers })); });
  return r;
}

async function tap(r: ReturnType<typeof render>, label: string) {
  await act(async () => { fireEvent.press(r.getByText(label)); });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('Accept asks first, naming the price, and does nothing when cancelled', async () => {
  mockConfirm.mockResolvedValue(false);
  const r = await openOffers();
  await tap(r, 'price-accept');
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  const [title, body, labels] = mockConfirm.mock.calls[0];
  expect(title).toBe(en.offers.confirm_accept_title);
  expect(body).toContain('1,200');
  expect(labels).toMatchObject({ confirm: en.offers.accept, cancel: en.common.cancel, destructive: false });
  expect(mockAccept).not.toHaveBeenCalled();
});

it('Accept hires once confirmed', async () => {
  mockConfirm.mockResolvedValue(true);
  const r = await openOffers();
  await tap(r, 'price-accept');
  expect(mockAccept).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
});

it('Deny asks first as a destructive action, and does nothing when cancelled', async () => {
  mockConfirm.mockResolvedValue(false);
  const r = await openOffers();
  await tap(r, 'price-deny');
  const [title, , labels] = mockConfirm.mock.calls[0];
  expect(title).toBe(en.offers.confirm_reject_title);
  expect(labels).toMatchObject({ confirm: en.offers.deny, destructive: true });
  expect(mockReject).not.toHaveBeenCalled();
});

it('Deny rejects the offer by id once confirmed', async () => {
  mockConfirm.mockResolvedValue(true);
  const r = await openOffers();
  await tap(r, 'price-deny');
  expect(mockReject).toHaveBeenCalledWith('o1');
});

it('bundle offers are guarded the same way, with the bundle price', async () => {
  mockConfirm.mockResolvedValue(false);
  const r = await openOffers();
  await tap(r, 'bundle-accept');
  await tap(r, 'bundle-deny');
  expect(mockConfirm).toHaveBeenCalledTimes(2);
  expect(mockConfirm.mock.calls[0][1]).toContain('2,500');
  expect(mockAcceptBundle).not.toHaveBeenCalled();
  expect(mockRejectBundle).not.toHaveBeenCalled();

  mockConfirm.mockResolvedValue(true);
  await tap(r, 'bundle-accept');
  await tap(r, 'bundle-deny');
  expect(mockAcceptBundle).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
  expect(mockRejectBundle).toHaveBeenCalledWith('b1');
});
