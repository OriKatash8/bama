import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ListingDetailModal } from '../ListingDetailModal';
import { startNegotiation } from '../../services/marketplaceService';
import en from '@core/i18n/translations/en.json';

/**
 * A rental belongs to an outside store: the popup names the store (never who
 * posted it) and its button opens the store's product page — no chat.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(professional)'],
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: jest.fn(({ children }) => children) }));
jest.mock('@core/firebase/firestore', () => ({ queryDocuments: jest.fn(), where: jest.fn() }));
jest.mock('../../services/marketplaceService', () => ({
  startNegotiation: jest.fn(), shareListingToCommunities: jest.fn(), deleteListing: jest.fn(),
}));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: jest.fn() }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string; displayName: string } }) => unknown) =>
    s({ user: { id: 'renter-1', displayName: 'X' } }),
}));

const M = en.marketplace;
const RENTAL = {
  id: 'r1', type: 'rental', productName: 'Aputure 600d', price: 250, location: 'Tel Aviv',
  posterId: 'admin-1', posterName: 'Dana Admin', status: 'available',
  storeName: 'RentCam TLV', productUrl: 'https://rentcam.example/600d',
} as never;

beforeEach(() => jest.clearAllMocks());

it('names the store, never the poster', () => {
  const r = render(<ListingDetailModal listing={RENTAL} onClose={jest.fn()} />);
  const row = r.getByTestId('listing-store-row');
  expect(within(row).getByText(M.store)).toBeTruthy();
  expect(within(row).getByText('RentCam TLV')).toBeTruthy();
  expect(r.queryByTestId('listing-seller-row')).toBeNull();
  expect(r.queryByText('Dana Admin')).toBeNull();
  expect(r.queryByText(M.posted_by)).toBeNull();
});

it('its button opens the store page; there is no chat with a seller', () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const r = render(<ListingDetailModal listing={RENTAL} onClose={jest.fn()} />);
  const btn = r.getByTestId('listing-primary-btn');
  expect(within(btn).getByText(M.go_to_store)).toBeTruthy();
  expect(r.queryByText(M.talk_with_seller)).toBeNull();
  fireEvent.press(btn);
  expect(open).toHaveBeenCalledWith('https://rentcam.example/600d');
  expect(startNegotiation).not.toHaveBeenCalled();
  open.mockRestore();
});

it('a rental without a link or store shows neither button nor poster', () => {
  const bare = { ...(RENTAL as object), storeName: null, productUrl: null } as never;
  const r = render(<ListingDetailModal listing={bare} onClose={jest.fn()} />);
  expect(r.queryByTestId('listing-primary-btn')).toBeNull();
  expect(r.queryByTestId('listing-store-row')).toBeNull();
  expect(r.queryByText('Dana Admin')).toBeNull();
});

it('shows the price per its period, and the whole photo', () => {
  const weekly = { ...(RENTAL as object), price: 700, pricePeriod: 'week', imageUrl: 'https://x/p.jpg' } as never;
  const r = render(<ListingDetailModal listing={weekly} onClose={jest.fn()} />);
  expect(r.getByText(`₪700${M.per_week}`)).toBeTruthy();
  expect(r.getByTestId('listing-detail-image').props.contentFit).toBe('contain');
});
