import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ListingDetailModal } from '../ListingDetailModal';
import { ListingCard } from '../ListingCard';
import { rentalItemToListing } from '@features/rentals/listing';
import { trackRentalClick } from '@features/rentals/rentalsService';
import type { RentalItem } from '@features/rentals/types';
import he from '@core/i18n/translations/he.json';

/**
 * A rental company's synced item: no poster, maybe no price; its button rents
 * through the company's site (with BAMA's UTM) and counts the tap.
 */

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useSegments: () => ['(professional)'] }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: jest.fn(({ children }) => children) }));
jest.mock('@core/firebase/firestore', () => ({ queryDocuments: jest.fn(), where: jest.fn() }));
jest.mock('@features/marketplace/services/marketplaceService', () => ({
  startNegotiation: jest.fn(), shareListingToCommunities: jest.fn(), deleteListing: jest.fn(),
}));
jest.mock('@features/rentals/rentalsService', () => ({ trackRentalClick: jest.fn(() => Promise.resolve({ counted: true })) }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
const mockToast = jest.fn();
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: mockToast }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'he' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string; displayName: string } }) => unknown) => s({ user: { id: 'u1', displayName: 'Uri' } }),
}));

const R = he.rentals;
const ITEM: RentalItem = {
  id: 'co_1', companyId: 'co', companyName: 'השכרת ציוד', companyCity: 'תל אביב', source: 'company',
  externalId: '1', externalUrl: 'https://store.example/p/', linkUrl: 'https://store.example/p/?utm_source=bama',
  name: 'Aputure 600d', description: 'פנס לד חזק', pricePerDay: 250, salePrice: null, sortPrice: 250, inStock: true,
  externalCategories: [], category: 'lighting', suggestedCategory: null, manualCategory: null,
  active: true, visible: true, images: [{ thumbUrl: 'https://img/t.webp', url: 'https://img/d.webp' }], clicks: 0,
};

beforeEach(() => jest.clearAllMocks());

describe('detail', () => {
  it('"השכרה דרך [company]" starts the count first (not awaited), then opens the UTM link — in the same tap', () => {
    const order: string[] = [];
    jest.spyOn(Linking, 'openURL').mockImplementation(async (url) => { order.push(`open ${url}`); return true; });
    (trackRentalClick as jest.Mock).mockImplementation(async (id: string) => { order.push(`track ${id}`); return { counted: true }; });
    const r = render(<ListingDetailModal listing={rentalItemToListing(ITEM)} onClose={jest.fn()} />);
    const btn = r.getByTestId('listing-rent-through');
    expect(within(btn).getByText(R.rent_through.replace('{{company}}', 'השכרת ציוד'))).toBeTruthy();
    fireEvent.press(btn);
    // Both happened synchronously inside the press: the count is already in flight when the store opens.
    expect(order).toEqual(['track co_1', 'open https://store.example/p/?utm_source=bama']);
  });

  it('a failed count never shows an error', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    (trackRentalClick as jest.Mock).mockRejectedValue(new Error('offline'));
    const r = render(<ListingDetailModal listing={rentalItemToListing(ITEM)} onClose={jest.fn()} />);
    fireEvent.press(r.getByTestId('listing-rent-through'));
    await new Promise((done) => setTimeout(done, 0)); // let the rejection settle
    expect(Linking.openURL).toHaveBeenCalledWith('https://store.example/p/?utm_source=bama');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('no report, no share or owner actions, no generic store button; the description and stock show', () => {
    const r = render(<ListingDetailModal listing={rentalItemToListing(ITEM)} onClose={jest.fn()} />);
    expect(r.queryByTestId('listing-report')).toBeNull();
    expect(r.queryByTestId('listing-primary-btn')).toBeNull();
    expect(r.getByTestId('listing-description')).toBeTruthy();
    expect(within(r.getByTestId('listing-stock-row')).getByText(R.in_stock)).toBeTruthy();
  });

  it('the large image, not the thumbnail', () => {
    const r = render(<ListingDetailModal listing={rentalItemToListing(ITEM)} onClose={jest.fn()} />);
    expect(r.getByTestId('listing-detail-image').props.source).toEqual({ uri: 'https://img/d.webp' });
  });

  it('no price: "price on request"', () => {
    const r = render(<ListingDetailModal listing={rentalItemToListing({ ...ITEM, pricePerDay: null })} onClose={jest.fn()} />);
    expect(r.getByText(R.price_on_request)).toBeTruthy();
  });
});

describe('card', () => {
  it('shows "price on request" instead of ₪0', () => {
    const r = render(<ListingCard listing={rentalItemToListing({ ...ITEM, pricePerDay: null })} onPress={jest.fn()} />);
    expect(r.getByTestId('listing-card-price-on-request')).toBeTruthy();
    expect(r.queryByText(/₪0/)).toBeNull();
  });

  it('says whether it is in stock', () => {
    const inStock = render(<ListingCard listing={rentalItemToListing(ITEM)} onPress={jest.fn()} />);
    expect(within(inStock.getByTestId('listing-card-stock')).getByText(R.in_stock)).toBeTruthy();
    const out = render(<ListingCard listing={rentalItemToListing({ ...ITEM, inStock: false })} onPress={jest.fn()} />);
    expect(within(out.getByTestId('listing-card-stock')).getByText(R.out_of_stock)).toBeTruthy();
  });

  it('a regular listing has no stock line', () => {
    const r = render(<ListingCard listing={{ ...rentalItemToListing(ITEM), source: undefined }} onPress={jest.fn()} />);
    expect(r.queryByTestId('listing-card-stock')).toBeNull();
  });
});
