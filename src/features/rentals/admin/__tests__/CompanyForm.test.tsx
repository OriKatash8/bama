import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import { CompanyForm } from '../CompanyForm';
import type { RentalCompany } from '../../types';

/** The platform: WooCommerce | Shopify | Manual, and "Detect platform" (server-side, saves nothing). */

jest.mock('react-native-reanimated', () => require('../../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
const mockSave = jest.fn(async (_i: unknown) => ({ companyId: 'co1' }));
const mockDetect = jest.fn();
jest.mock('../../rentalsService', () => ({
  saveRentalCompany: (i: unknown) => mockSave(i),
  detectRentalPlatform: (u: string) => mockDetect(u),
}));

const A = en.admin_rental_companies;
beforeEach(() => jest.clearAllMocks());

function setup(company: RentalCompany | null = null) {
  const onSaved = jest.fn();
  const r = render(<CompanyForm company={company} onSaved={onSaved} onCancel={jest.fn()} />);
  return { r, onSaved };
}

it('offers WooCommerce, Shopify and Manual', () => {
  const { r } = setup();
  for (const p of ['woocommerce', 'shopify', 'manual']) expect(r.getByTestId(`company-source-${p}`)).toBeTruthy();
});

it('a Shopify store needs its address; a manual shop does not', async () => {
  const { r } = setup();
  fireEvent.changeText(r.getByTestId('company-field-name'), 'Shop');
  fireEvent.press(r.getByTestId('company-source-shopify'));
  fireEvent.press(r.getByTestId('company-save'));
  expect(r.getByTestId('company-form-error').props.children).toBe(A.url_required);
  expect(mockSave).not.toHaveBeenCalled();

  fireEvent.press(r.getByTestId('company-source-manual'));
  fireEvent.press(r.getByTestId('company-save'));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0]).toMatchObject({ name: 'Shop', sourceType: 'manual', sourceUrl: '' });
});

it('Detect asks the server, then sets the platform and the address it ended on; saving sends them', async () => {
  mockDetect.mockResolvedValue({
    platform: 'shopify', storeUrl: 'https://www.shop.co.il/',
    checked: [
      { url: 'https://www.shop.co.il/wp-json/wc/store/v1/products?per_page=1', status: 404, result: 'not WooCommerce' },
      { url: 'https://www.shop.co.il/products.json?limit=1', status: 200, result: 'Shopify store' },
    ],
  });
  const { r } = setup();
  fireEvent.changeText(r.getByTestId('company-field-name'), 'Shop');
  fireEvent.changeText(r.getByTestId('company-field-sourceUrl'), 'shop.co.il');
  fireEvent.press(r.getByTestId('company-detect'));
  await waitFor(() => expect(r.getByTestId('company-detected')).toBeTruthy());
  expect(mockDetect).toHaveBeenCalledWith('shop.co.il');
  expect(r.getByText(A.detected_shopify)).toBeTruthy();
  expect(r.getByTestId('company-field-sourceUrl').props.value).toBe('https://www.shop.co.il/');
  expect(mockSave).not.toHaveBeenCalled(); // detecting saves nothing

  fireEvent.press(r.getByTestId('company-save'));
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0]).toMatchObject({ sourceType: 'shopify', sourceUrl: 'https://www.shop.co.il/' });
});

it('Detect uses the website when no store address was typed', async () => {
  mockDetect.mockResolvedValue({ platform: 'manual', storeUrl: 'https://www.arielglikson.com/', checked: [] });
  const { r } = setup();
  fireEvent.changeText(r.getByTestId('company-field-website'), 'https://www.arielglikson.com/');
  fireEvent.press(r.getByTestId('company-detect'));
  await waitFor(() => expect(r.getByText(A.detected_manual)).toBeTruthy());
  expect(mockDetect).toHaveBeenCalledWith('https://www.arielglikson.com/');
});

it('a refused address is shown, not swallowed', async () => {
  mockDetect.mockRejectedValue(new Error("FirebaseError: Enter the store's address, e.g. https://store.co.il"));
  const { r } = setup();
  fireEvent.changeText(r.getByTestId('company-field-sourceUrl'), 'localhost');
  fireEvent.press(r.getByTestId('company-detect'));
  await waitFor(() => expect(String(r.getByTestId('company-form-error').props.children)).toContain("Enter the store's address"));
});

it('an existing company with an unknown stored platform opens as Manual', () => {
  const { r } = setup({ id: 'c', name: 'X', sourceType: 'wix', sourceUrl: '' } as unknown as RentalCompany);
  // The selected segment carries accessibilityState.selected.
  expect(r.getByTestId('company-source-manual').props.accessibilityState).toMatchObject({ selected: true });
});
