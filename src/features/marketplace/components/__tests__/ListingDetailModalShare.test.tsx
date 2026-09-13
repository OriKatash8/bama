import React from 'react';
import { Modal } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ListingDetailModal } from '../ListingDetailModal';
import { shareListingToCommunities } from '../../services/marketplaceService';
import { queryDocuments } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';

/**
 * SHARING A LISTING TO MY COMMUNITIES.
 *
 * The picker used to be a second <Modal> rendered as a SIBLING of the listing
 * modal. Web draws modals as overlays, so it worked there; iOS can't present a
 * sibling modal while another is up, so on the phone the button did nothing.
 * The single-Modal assertion is what guards against that shape coming back —
 * the test renderer happily "shows" a sibling modal, so asserting the picker text
 * alone would stay green against the bug.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(professional)'],
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@core/firebase/firestore', () => ({ queryDocuments: jest.fn(), where: jest.fn() }));
jest.mock('../../services/marketplaceService', () => ({
  startNegotiation: jest.fn(),
  shareListingToCommunities: jest.fn(),
  deleteListing: jest.fn(),
}));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
const mockShowToast = jest.fn();
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: mockShowToast }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string; displayName: string } }) => unknown) =>
    s({ user: { id: 'owner-1', displayName: 'Owner' } }),
}));

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockShare = shareListingToCommunities as jest.MockedFunction<typeof shareListingToCommunities>;

const listing = {
  id: 'l1', type: 'second_hand', productName: 'Tripod', price: 200,
  location: 'Tel Aviv', posterId: 'owner-1', posterName: 'Owner', status: 'active',
} as never;

const communities = [
  { id: 'c1', type: 'community', name: 'Photographers', members: ['owner-1'] },
  { id: 'c2', type: 'community', name: 'Editors', members: ['owner-1'] },
];

async function openPicker() {
  const r = render(<ListingDetailModal listing={listing} onClose={jest.fn()} />);
  await act(async () => { fireEvent.press(r.getByText(en.marketplace.share_to_communities)); });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue(communities as never);
  mockShare.mockResolvedValue(undefined as never);
});

it('opens the picker inside the listing modal, not as a second modal', async () => {
  const r = await openPicker();
  expect(r.getByText(en.marketplace.share_picker_title)).toBeTruthy();
  expect(r.getByText('Photographers')).toBeTruthy();
  expect(r.UNSAFE_getAllByType(Modal)).toHaveLength(1);
});

it('shares to the selected communities and closes the picker', async () => {
  const r = await openPicker();
  fireEvent.press(r.getByText('Editors'));
  await act(async () => {
    fireEvent.press(r.getByText(en.marketplace.share_submit.replace('{{count}}', '1')));
  });
  expect(mockShare).toHaveBeenCalledWith(listing, ['c2'], { id: 'owner-1', name: 'Owner' });
  expect(r.queryByText(en.marketplace.share_picker_title)).toBeNull();
});

it('closes the picker without closing the listing', async () => {
  const onClose = jest.fn();
  const r = render(<ListingDetailModal listing={listing} onClose={onClose} />);
  await act(async () => { fireEvent.press(r.getByText(en.marketplace.share_to_communities)); });
  // Android back button: the modal's onRequestClose must peel the picker first.
  act(() => { r.UNSAFE_getByType(Modal).props.onRequestClose(); });
  expect(r.queryByText(en.marketplace.share_picker_title)).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  act(() => { r.UNSAFE_getByType(Modal).props.onRequestClose(); });
  expect(onClose).toHaveBeenCalledTimes(1);
});
