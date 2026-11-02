import React from 'react';
import { Linking, StyleSheet } from 'react-native';
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

  it('no report, no share or owner actions, no generic store button, no stock line; the description shows', () => {
    const r = render(<ListingDetailModal listing={rentalItemToListing(ITEM)} onClose={jest.fn()} />);
    expect(r.queryByTestId('listing-report')).toBeNull();
    expect(r.queryByTestId('listing-primary-btn')).toBeNull();
    expect(r.getByTestId('listing-description')).toBeTruthy();
    // No stock line in the item's information.
    expect(r.queryByTestId('listing-stock-row')).toBeNull();
    expect(r.queryByText(/מלאי/)).toBeNull();
  });

  it('the description sits in its own "מידע" box, separate from the store', () => {
    const r = render(<ListingDetailModal listing={rentalItemToListing(ITEM)} onClose={jest.fn()} />);
    const info = r.getByTestId('listing-information-box');
    expect(within(info).getByText(R.information)).toBeTruthy();
    expect(within(info).getByText('פנס לד חזק')).toBeTruthy();
    expect(within(r.getByTestId('listing-store-row')).queryByText('פנס לד חזק')).toBeNull();
  });

  it('no description, no information box', () => {
    const r = render(<ListingDetailModal listing={rentalItemToListing({ ...ITEM, description: '' })} onClose={jest.fn()} />);
    expect(r.queryByTestId('listing-information-box')).toBeNull();
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

  it('shows no stock line, in stock or not', () => {
    for (const inStock of [true, false]) {
      const r = render(<ListingCard listing={rentalItemToListing({ ...ITEM, inStock })} onPress={jest.fn()} />);
      expect(r.queryByTestId('listing-card-stock')).toBeNull();
      expect(r.queryByText(/מלאי/)).toBeNull();
    }
  });
});

describe('rental popup look', () => {
  const flat = (el: { props: Record<string, unknown> }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

  it('every text is black, and a title sits on the first line of a two-line value', () => {
    const r = render(<ListingDetailModal listing={rentalItemToListing({ ...ITEM, name: 'Aputure LS 600d Pro II with a very long name that wraps' })} onClose={jest.fn()} />);
    const nameBox = r.getByTestId('listing-name-box');
    const row = nameBox.children[0] as unknown as { props: Record<string, unknown> };
    expect(flat(row).alignItems).toBe('flex-start');
    for (const text of ['השכרת ציוד', 'פנס לד חזק']) {
      expect(flat(r.getByText(text)).color).toBe('#000000');
    }
    expect(flat(r.getByText(/₪250/)).color).toBe('#000000');
    // The title does not wrap with the value.
    const label = within(nameBox).getAllByText(/:/)[0];
    expect(flat(label)).toEqual(expect.objectContaining({ color: '#000000', flexShrink: 0 }));
  });

  it('the button keeps its design', () => {
    const r = render(<ListingDetailModal listing={rentalItemToListing(ITEM)} onClose={jest.fn()} />);
    expect(flat(r.getByTestId('listing-rent-through')).backgroundColor).toBe('#004aad');
  });

  it('the second-hand popup is unchanged', () => {
    const sale = { ...rentalItemToListing(ITEM), type: 'secondhand', source: undefined, posterId: 'p1', posterName: 'Avi', storeName: null } as never;
    const r = render(<ListingDetailModal listing={sale} onClose={jest.fn()} />);
    const row = r.getByTestId('listing-name-box').children[0] as unknown as { props: Record<string, unknown> };
    expect(flat(row).alignItems).toBe('center');
    expect(flat(r.getByText('Avi')).color).toBe('#004aad');
  });
});
