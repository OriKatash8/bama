import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { onSnapshot } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import MarketplaceAdmin from '../marketplace';
import { deleteListing } from '@features/marketplace/services/marketplaceService';

/**
 * The admin Marketplace page in the admin kit's design: back to Operations,
 * a status segment with counts, the listings as rows in one card, delete behind
 * a confirm.
 */

let mockLang = 'en';
let mockCanGoBack = true;
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockToast = jest.fn();

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: mockToast }) }));
jest.mock('@features/marketplace/services/marketplaceService', () => ({ deleteListing: jest.fn(() => Promise.resolve()) }));
// The app's own add-listing popup; its form has its own tests. Here: what the page opens it with.
const mockSheet = jest.fn();
jest.mock('@features/marketplace/components/PostListingSheet', () => ({
  PostListingSheet: (props: Record<string, unknown>) => { mockSheet(props); return null; },
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), orderBy: jest.fn(), onSnapshot: jest.fn(),
}));

const M = en.marketplace;
const AM = en.admin_marketplace;

const listings = [
  { id: 'l1', type: 'secondhand', productName: 'Sony FX3', price: 12000, posterName: 'Avi', location: 'Haifa', imageUrl: 'https://x/fx3.jpg', status: 'available', createdAt: { seconds: 1_700_000_000 } },
  { id: 'l2', type: 'rental', productName: 'Aputure 600d', price: 250, posterName: 'Noa', location: 'Tel Aviv', imageUrl: null, status: 'reserved', createdAt: { seconds: 1_700_000_000 } },
  { id: 'l3', type: 'secondhand', productName: 'Old Tripod', price: 100, posterName: 'Ben', location: 'Eilat', imageUrl: null, createdAt: { seconds: 1_700_000_000 } },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockCanGoBack = true;
  (onSnapshot as jest.Mock).mockImplementation((_q, next: (s: unknown) => void) => {
    next({ docs: listings.map(({ id, ...d }) => ({ id, data: () => d })) });
    return () => {};
  });
});

it('shows the title and the greeting header, with a back button to Operations', () => {
  const r = render(<MarketplaceAdmin />);
  expect(r.getByText(AM.title, { exact: true })).toBeTruthy();
  expect(r.getByText(`${en.admin_dashboard.greeting}, Dana`)).toBeTruthy();
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockBack).toHaveBeenCalled();
});

it('falls back to Operations when there is no history', () => {
  mockCanGoBack = false;
  const r = render(<MarketplaceAdmin />);
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockReplace).toHaveBeenCalledWith('/admin/operations');
  expect(mockBack).not.toHaveBeenCalled();
});

it('lists every listing with its type, price, poster and status', () => {
  const r = render(<MarketplaceAdmin />);
  const row = within(r.getByTestId('listing-l2'));
  expect(row.getByText('Aputure 600d')).toBeTruthy();
  expect(row.getByText(`${M.rental} · ₪250`)).toBeTruthy();
  expect(row.getByText(/^Noa · Tel Aviv · /)).toBeTruthy();
  expect(row.getByText(AM.status_reserved)).toBeTruthy();
  // A listing without a status counts as available.
  expect(within(r.getByTestId('listing-l3')).getByText(AM.status_available)).toBeTruthy();
  expect(within(r.getByTestId('listings-count')).getByText('2')).toBeTruthy();
});

it('rentals have their own section; the 2nd-hand card holds the rest', () => {
  const r = render(<MarketplaceAdmin />);
  const rentals = within(r.getByTestId('rentals-card'));
  expect(rentals.getByText(AM.rentals)).toBeTruthy();
  expect(rentals.getByTestId('listing-l2')).toBeTruthy();
  expect(rentals.queryByTestId('listing-l1')).toBeNull();
  expect(within(r.getByTestId('rentals-count')).getByText('1')).toBeTruthy();
  const market = within(r.getByTestId('listings-card'));
  expect(market.getByTestId('listing-l1')).toBeTruthy();
  expect(market.queryByTestId('listing-l2')).toBeNull();
});

it('"Add a rental" opens the app\'s add-listing popup, locked to Rental', () => {
  const r = render(<MarketplaceAdmin />);
  expect(mockSheet).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
  fireEvent.press(r.getByTestId('add-rental'));
  expect(mockSheet).toHaveBeenLastCalledWith(expect.objectContaining({ visible: true, initialType: 'rental', lockedType: true }));
  act(() => { (mockSheet.mock.calls.at(-1)![0] as { onClose: () => void }).onClose(); });
  expect(mockSheet).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));
});

it('says so when there are no rentals yet', () => {
  (onSnapshot as jest.Mock).mockImplementation((_q, next: (s: unknown) => void) => {
    next({ docs: listings.filter((l) => l.type !== 'rental').map(({ id, ...d }) => ({ id, data: () => d })) });
    return () => {};
  });
  const r = render(<MarketplaceAdmin />);
  expect(within(r.getByTestId('rentals-card')).getByText(AM.no_rentals)).toBeTruthy();
});

it('filters the 2nd-hand listings by status, with counts', () => {
  const r = render(<MarketplaceAdmin />);
  expect(r.getByText(`${AM.filter_all} (2)`)).toBeTruthy();
  expect(r.getByText(`${AM.status_available} (2)`)).toBeTruthy();
  expect(r.getByText(`${AM.status_reserved} (0)`)).toBeTruthy();
  fireEvent.press(r.getByTestId('filter-reserved'));
  expect(r.getByTestId('filter-reserved').props.accessibilityState.selected).toBe(true);
  const market = within(r.getByTestId('listings-card'));
  expect(market.queryByTestId('listing-l1')).toBeNull();
  expect(market.getByText(M.no_listings)).toBeTruthy();
  // The rental section is not filtered.
  expect(within(r.getByTestId('rentals-card')).getByTestId('listing-l2')).toBeTruthy();
});

it('deletes a listing only after the confirm', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const r = render(<MarketplaceAdmin />);
  fireEvent.press(r.getByTestId('delete-l1'));
  expect(alert).toHaveBeenCalledWith(M.delete_confirm_title, expect.stringContaining('Sony FX3'), expect.any(Array));
  expect(deleteListing).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  expect(buttons.map((b) => b.text)).toEqual([M.cancel, M.delete_listing]);
  await act(async () => { await buttons[1].onPress?.(); });
  expect(deleteListing).toHaveBeenCalledWith('l1', 'https://x/fx3.jpg');
  expect(mockToast).toHaveBeenCalledWith(M.listing_deleted, 'success');
  alert.mockRestore();
});

it('mirrors in Hebrew: text aligns right, rows run right to left', () => {
  mockLang = 'he';
  const r = render(<MarketplaceAdmin />);
  const title = r.getAllByText(he.admin_marketplace.title)[0];
  expect(StyleSheet.flatten(title.props.style).textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByTestId('dash-header-row').props.style).flexDirection).toBe('row-reverse');
  expect(StyleSheet.flatten(r.getByTestId('listing-l1').props.style).flexDirection).toBe('row-reverse');
  expect(StyleSheet.flatten(r.getByText('Sony FX3').props.style).textAlign).toBe('right');
});
