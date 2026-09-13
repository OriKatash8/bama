import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ListingDetailModal } from '../ListingDetailModal';

/**
 * "View a product" uses the same visual language as "add a listing"
 * (PostListingSheet): a white 24-radius card instead of the pink-blue gradient,
 * radius-16 buttons with 14px vertical padding and 15px bold labels, and pill
 * outlines for the secondary actions.
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

const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

const PRIMARY = { borderRadius: 16, paddingVertical: 14, backgroundColor: '#004aad' };

it('is a white card, not the gradient', () => {
  mockUid = 'owner-1';
  const r = render(<ListingDetailModal listing={listing} onClose={jest.fn()} />);
  expect(LinearGradient).not.toHaveBeenCalled();
  expect(flat(r.getByTestId('listing-card'))).toEqual(expect.objectContaining({ backgroundColor: '#ffffff', borderRadius: 24 }));
});

it("owner: share is the add-listing primary button; edit and delete are pill outlines", () => {
  mockUid = 'owner-1';
  const r = render(<ListingDetailModal listing={listing} onClose={jest.fn()} />);
  expect(flat(r.getByTestId('listing-primary-btn'))).toEqual(expect.objectContaining(PRIMARY));
  for (const id of ['listing-edit-btn', 'listing-delete-btn']) {
    expect(flat(r.getByTestId(id))).toEqual(expect.objectContaining({ borderRadius: 16, borderWidth: 1, backgroundColor: '#ffffff' }));
  }
});

it('buyer: talk-with-seller is the same primary button', () => {
  mockUid = 'buyer-1';
  const r = render(<ListingDetailModal listing={listing} onClose={jest.fn()} />);
  expect(flat(r.getByTestId('listing-primary-btn'))).toEqual(expect.objectContaining(PRIMARY));
});
