import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import { ManualItemsCard } from '../ManualItemsCard';
import type { RentalCompany, RentalItem } from '../../types';

/**
 * A manual company's items: add, edit (keep / replace / remove the picture) and
 * remove. Everything goes through the callables; the card only shapes the input.
 */

jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'admin1' } }),
}));
const mockPick = jest.fn();
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...a: unknown[]) => mockPick(...a) }));
const mockConfirm = jest.fn();
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: (...a: unknown[]) => mockConfirm(...a) }));
const mockSave = jest.fn(async (_i: unknown) => ({ itemId: 'co1_mNEW' }));
const mockRemove = jest.fn(async (_id: string) => ({ removed: true }));
const mockUpload = jest.fn(async (_uid: string, _uri: string) => 'rentalUploads/admin1/abc');
jest.mock('../../rentalsService', () => ({
  saveRentalItem: (i: unknown) => mockSave(i),
  removeRentalItem: (id: string) => mockRemove(id),
  uploadRentalImage: (uid: string, uri: string) => mockUpload(uid, uri),
}));

const A = en.admin_rental_companies;
const COMPANY = { id: 'co1', name: 'Glikson', website: 'https://www.arielglikson.com/', sourceUrl: '', sourceType: 'manual' } as RentalCompany;
const ITEM = {
  id: 'co1_m1', companyId: 'co1', externalId: 'm1', name: 'Sony FX3', pricePerDay: 300, category: 'camera',
  manualCategory: 'camera', description: 'Body only', externalUrl: 'https://www.arielglikson.com/fx3', active: true,
  images: [{ thumbUrl: 'https://img/t.webp', url: 'https://img/d.webp' }], imageSources: ['upload'],
} as unknown as RentalItem;

function setup(items: RentalItem[] = [ITEM]) {
  const onChanged = jest.fn();
  const onToast = jest.fn();
  const r = render(<ManualItemsCard company={COMPANY} items={items} onChanged={onChanged} onToast={onToast} />);
  return { r, onChanged, onToast };
}

beforeEach(() => jest.clearAllMocks());

it('lists the live items with price and category; removed ones are not listed', () => {
  const { r } = setup([ITEM, { ...ITEM, id: 'co1_m2', name: 'Gone', active: false } as RentalItem]);
  expect(r.getByText('Sony FX3')).toBeTruthy();
  expect(r.queryByText('Gone')).toBeNull();
  expect(r.getByText(`${A.per_day.replace('{{price}}', '300')} · ${en.marketplace.category_camera}`)).toBeTruthy();
});

it('an empty form is refused before any call', () => {
  const { r } = setup([]);
  fireEvent.press(r.getByTestId('manual-add'));
  fireEvent.press(r.getByTestId('manual-save'));
  expect(r.getByTestId('manual-error').props.children).toBe(A.name_item_required);
  fireEvent.changeText(r.getByTestId('manual-field-name'), 'Aputure 600d');
  fireEvent.press(r.getByTestId('manual-save'));
  expect(r.getByTestId('manual-error').props.children).toBe(A.category_required);
  fireEvent.press(r.getByTestId('manual-cat-lighting'));
  fireEvent.changeText(r.getByTestId('manual-field-price'), '0');
  fireEvent.press(r.getByTestId('manual-save'));
  expect(r.getByTestId('manual-error').props.children).toBe(A.price_invalid);
  expect(mockSave).not.toHaveBeenCalled();
});

it('a new item with a picked picture: uploads it to staging, then saves with its path', async () => {
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] });
  const { r, onChanged } = setup([]);
  fireEvent.press(r.getByTestId('manual-add'));
  fireEvent.changeText(r.getByTestId('manual-field-name'), 'Aputure 600d');
  fireEvent.changeText(r.getByTestId('manual-field-price'), '1,250');
  fireEvent.press(r.getByTestId('manual-cat-lighting'));
  fireEvent.press(r.getByTestId('manual-pick'));
  await waitFor(() => expect(r.getByTestId('manual-preview')).toBeTruthy());
  fireEvent.press(r.getByTestId('manual-save'));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockUpload).toHaveBeenCalledWith('admin1', 'file:///photo.jpg');
  expect(mockSave).toHaveBeenCalledWith({
    companyId: 'co1', name: 'Aputure 600d', pricePerDay: 1250, category: 'lighting', description: '', productUrl: null,
    image: { uploadPath: 'rentalUploads/admin1/abc' },
  });
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it('an empty price is "price on request"; a pasted image URL is sent as a URL', async () => {
  const { r } = setup([]);
  fireEvent.press(r.getByTestId('manual-add'));
  fireEvent.changeText(r.getByTestId('manual-field-name'), 'Tripod');
  fireEvent.press(r.getByTestId('manual-cat-grip'));
  fireEvent.changeText(r.getByTestId('manual-field-imageUrl'), ' https://cdn.example.com/t.jpg ');
  fireEvent.press(r.getByTestId('manual-save'));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockSave.mock.calls[0][0]).toMatchObject({ pricePerDay: null, image: { url: 'https://cdn.example.com/t.jpg' } });
});

it('editing: keeps the current picture unless replaced or removed; sends the item id', async () => {
  const { r } = setup();
  fireEvent.press(r.getByTestId('manual-edit-co1_m1'));
  expect(r.getByTestId('manual-field-name').props.value).toBe('Sony FX3');
  expect(r.getByTestId('manual-field-productUrl').props.value).toBe('https://www.arielglikson.com/fx3');
  fireEvent.press(r.getByTestId('manual-save'));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0]).toMatchObject({ itemId: 'co1_m1', pricePerDay: 300, category: 'camera' });
  expect(mockSave.mock.calls[0][0]).not.toHaveProperty('image'); // kept

  mockSave.mockClear();
  fireEvent.press(r.getByTestId('manual-edit-co1_m1'));
  fireEvent.press(r.getByTestId('manual-image-remove'));
  fireEvent.press(r.getByTestId('manual-save'));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0]).toMatchObject({ itemId: 'co1_m1', image: null });
});

it('an item linking to the company site shows no product URL of its own', () => {
  const { r } = setup([{ ...ITEM, externalUrl: 'https://www.arielglikson.com/' } as RentalItem]);
  fireEvent.press(r.getByTestId('manual-edit-co1_m1'));
  expect(r.getByTestId('manual-field-productUrl').props.value).toBe('');
});

it('remove asks first (confirmDialog), then calls the function', async () => {
  mockConfirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const { r, onToast } = setup();
  fireEvent.press(r.getByTestId('manual-remove-co1_m1'));
  await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
  expect(mockRemove).not.toHaveBeenCalled();
  fireEvent.press(r.getByTestId('manual-remove-co1_m1'));
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('co1_m1'));
  await waitFor(() => expect(onToast).toHaveBeenCalledWith(A.item_removed, 'success'));
});

it('a server refusal is shown in the form, not swallowed', async () => {
  mockSave.mockRejectedValueOnce(new Error('FirebaseError: productUrl must be an https web address'));
  const { r } = setup([]);
  fireEvent.press(r.getByTestId('manual-add'));
  fireEvent.changeText(r.getByTestId('manual-field-name'), 'X');
  fireEvent.press(r.getByTestId('manual-cat-lens'));
  fireEvent.press(r.getByTestId('manual-save'));
  await waitFor(() => expect(r.getByTestId('manual-error').props.children).toContain('productUrl must be an https web address'));
});
