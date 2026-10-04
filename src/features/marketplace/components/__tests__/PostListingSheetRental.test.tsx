import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PostListingSheet } from '../PostListingSheet';
import en from '@core/i18n/translations/en.json';

/**
 * Adding a rental asks for the store and the product page it opens; both are
 * required, the link is completed to https, and a non-link is refused.
 */

const mockCreate = jest.fn(() => Promise.resolve());
const mockUpdate = jest.fn(() => Promise.resolve());
const mockToast = jest.fn();
jest.mock('../../hooks/useCreateListing', () => ({ useCreateListing: () => ({ create: mockCreate, isSubmitting: false }) }));
jest.mock('../../hooks/useUpdateListing', () => ({ useUpdateListing: () => ({ update: mockUpdate, isSubmitting: false }) }));
jest.mock('../CityPickerModal', () => ({ CityPickerModal: () => null }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
const mockPick = jest.fn((_options: unknown) => Promise.resolve({ canceled: true }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (o: unknown) => mockPick(o) }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: mockToast }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const M = en.marketplace;
const RENTAL_EDIT = {
  id: 'r1', type: 'rental', productName: 'Aputure 600d', price: 250, location: 'Tel Aviv', category: 'lighting',
  posterId: 'a', posterName: 'A', imageUrl: null, createdAt: { seconds: 0, nanoseconds: 0 },
} as never;

beforeEach(() => jest.clearAllMocks());

/** An existing rental (name, category, city, price filled) still missing store + link. */
const open = () => render(<PostListingSheet visible initialType="rental" lockedType editListing={RENTAL_EDIT} onClose={jest.fn()} />);
const disabled = (r: ReturnType<typeof render>) => r.getByTestId('listing-submit').props.accessibilityState?.disabled;

it('asks for the store name and the product link', () => {
  const r = open();
  expect(r.getByText(M.store_name)).toBeTruthy();
  expect(r.getByText(M.product_link)).toBeTruthy();
});

it('2nd-hand has neither field', () => {
  const r = render(<PostListingSheet visible initialType="secondhand" lockedType onClose={jest.fn()} />);
  expect(r.queryByTestId('input-store-name')).toBeNull();
  expect(r.queryByTestId('input-product-url')).toBeNull();
});

it('both are required before it can be saved', () => {
  const r = open();
  expect(disabled(r)).toBe(true);
  fireEvent.changeText(r.getByTestId('input-store-name'), 'RentCam');
  expect(disabled(r)).toBe(true);
  fireEvent.changeText(r.getByTestId('input-product-url'), 'rentcam.example/600d');
  expect(disabled(r)).toBe(false);
});

it('a non-link is refused with a message', async () => {
  const r = open();
  fireEvent.changeText(r.getByTestId('input-store-name'), 'RentCam');
  fireEvent.changeText(r.getByTestId('input-product-url'), 'not a link');
  await act(async () => { fireEvent.press(r.getByTestId('listing-submit')); });
  expect(mockToast).toHaveBeenCalledWith(M.url_invalid, 'error');
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('saves the store and the link, completed to https', async () => {
  const r = open();
  fireEvent.changeText(r.getByTestId('input-store-name'), ' RentCam ');
  fireEvent.changeText(r.getByTestId('input-product-url'), 'rentcam.example/600d');
  await act(async () => { fireEvent.press(r.getByTestId('listing-submit')); });
  expect(mockUpdate).toHaveBeenCalledWith('r1', RENTAL_EDIT, expect.objectContaining({
    type: 'rental', storeName: 'RentCam', productUrl: 'https://rentcam.example/600d',
  }));
});

it('price per day, week or month: Day first, and the choice changes the suffix and hint', () => {
  const r = open();
  expect(r.getByTestId('period-day').props.accessibilityState.selected).toBe(true);
  expect(r.getByText(M.period_week)).toBeTruthy();
  expect(r.getByText(M.period_month)).toBeTruthy();
  expect(r.getByTestId('price-suffix').props.children).toBe(M.per_day);
  fireEvent.press(r.getByTestId('period-week'));
  expect(r.getByTestId('period-week').props.accessibilityState.selected).toBe(true);
  expect(r.getByTestId('price-suffix').props.children).toBe(M.per_week);
  expect(r.getByTestId('input-price').props.placeholder).toBe(M.price_per_week);
});

it('saves the chosen period', async () => {
  const r = open();
  fireEvent.changeText(r.getByTestId('input-store-name'), 'RentCam');
  fireEvent.changeText(r.getByTestId('input-product-url'), 'https://rentcam.example/600d');
  fireEvent.press(r.getByTestId('period-month'));
  await act(async () => { fireEvent.press(r.getByTestId('listing-submit')); });
  expect(mockUpdate).toHaveBeenCalledWith('r1', RENTAL_EDIT, expect.objectContaining({ pricePeriod: 'month' }));
});

it('editing a weekly rental starts on Week', () => {
  const r = render(<PostListingSheet visible initialType="rental" lockedType editListing={{ ...(RENTAL_EDIT as object), pricePeriod: 'week' } as never} onClose={jest.fn()} />);
  expect(r.getByTestId('period-week').props.accessibilityState.selected).toBe(true);
});

it('2nd-hand has no period choice', () => {
  const r = render(<PostListingSheet visible initialType="secondhand" lockedType onClose={jest.fn()} />);
  expect(r.queryByTestId('period-day')).toBeNull();
});

it("the seller crops their own photo (editor on, no forced aspect), for rentals and 2nd-hand", async () => {
  const r = open();
  await act(async () => { fireEvent.press(r.getByText(M.upload_photo)); });
  expect(mockPick).toHaveBeenLastCalledWith(expect.objectContaining({ allowsEditing: true }));
  expect(mockPick.mock.calls.at(-1)![0]).not.toHaveProperty('aspect');
  const s = render(<PostListingSheet visible initialType="secondhand" lockedType onClose={jest.fn()} />);
  await act(async () => { fireEvent.press(s.getByText(M.upload_photo)); });
  expect(mockPick).toHaveBeenLastCalledWith(expect.objectContaining({ allowsEditing: true }));
  expect(mockPick.mock.calls.at(-1)![0]).not.toHaveProperty('aspect');
});
