import React from 'react';
import { render, within } from '@testing-library/react-native';
import { ListingDetailModal } from '../ListingDetailModal';
import en from '@core/i18n/translations/en.json';

/**
 * Viewing a marketplace item: right under the picture, a box reads
 * "Product name:" and the item's name. The header no longer repeats the name;
 * it only has the close button.
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
let mockUid = 'owner-1';
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string; displayName: string } }) => unknown) =>
    s({ user: { id: mockUid, displayName: 'X' } }),
}));

const listing = {
  id: 'l1', type: 'second_hand', productName: 'Tripod', price: 200, location: 'Tel Aviv',
  posterId: 'owner-1', posterName: 'Owner', status: 'active',
} as never;

it('shows a "Product name:" box with the name, right under the picture', () => {
  mockUid = 'buyer-1';
  const r = render(<ListingDetailModal listing={listing} onClose={jest.fn()} />);
  const box = r.getByTestId('listing-name-box');
  expect(within(box).getByText(`${en.marketplace.product_name}:`)).toBeTruthy();
  expect(within(box).getByText('Tripod')).toBeTruthy();

  // Under the picture and above the price, in rendered order.
  const tree = JSON.stringify(r.toJSON());
  const imageAt = tree.indexOf('"listing-image"');
  const boxAt = tree.indexOf('"listing-name-box"');
  const priceAt = tree.indexOf('₪200');
  expect(imageAt).toBeGreaterThan(-1);
  expect(boxAt).toBeGreaterThan(imageAt);
  expect(priceAt).toBeGreaterThan(boxAt);
});

it('the header has only the close button, not the name', () => {
  mockUid = 'buyer-1';
  const r = render(<ListingDetailModal listing={listing} onClose={jest.fn()} />);
  // The name appears exactly once: inside the box.
  expect(r.getAllByText('Tripod')).toHaveLength(1);
  expect(within(r.getByTestId('listing-name-box')).getByText('Tripod')).toBeTruthy();
  expect(r.getByTestId('listing-close')).toBeTruthy();
});
