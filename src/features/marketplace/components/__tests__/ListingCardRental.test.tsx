import React from 'react';
import { render } from '@testing-library/react-native';
import { ListingCard } from '../ListingCard';
import en from '@core/i18n/translations/en.json';

/** A rental card names the store, never who posted it; 2nd-hand keeps "by <poster>". */

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const base = { id: 'x', productName: 'Aputure 600d', price: 250, location: 'Tel Aviv', posterId: 'a', posterName: 'Dana Admin', imageUrl: null };

it('rental: "Location · Store", no poster', () => {
  const r = render(<ListingCard listing={{ ...base, type: 'rental', storeName: 'RentCam' } as never} onPress={jest.fn()} />);
  expect(r.getByText('Tel Aviv · RentCam')).toBeTruthy();
  expect(r.queryByText(/Dana Admin/)).toBeNull();
});

it('2nd-hand: still "Location · by <poster>"', () => {
  const r = render(<ListingCard listing={{ ...base, type: 'secondhand' } as never} onPress={jest.fn()} />);
  expect(r.getByText(`Tel Aviv · ${en.marketplace.by} Dana Admin`)).toBeTruthy();
});

it("a rental's price shows its period; one without a period is per day", () => {
  const month = render(<ListingCard listing={{ ...base, type: 'rental', price: 900, pricePeriod: 'month' } as never} onPress={jest.fn()} />);
  expect(month.getByText(`₪900${en.marketplace.per_month}`)).toBeTruthy();
  const old = render(<ListingCard listing={{ ...base, type: 'rental' } as never} onPress={jest.fn()} />);
  expect(old.getByText(`₪250${en.marketplace.per_day}`)).toBeTruthy();
});

it('every listing shows its whole photo, fitted', () => {
  const pic = { imageUrl: 'https://x/p.jpg' };
  const rental = render(<ListingCard listing={{ ...base, ...pic, type: 'rental' } as never} onPress={jest.fn()} />);
  expect(rental.getByTestId('listing-card-image').props.contentFit).toBe('contain');
  const used = render(<ListingCard listing={{ ...base, ...pic, type: 'secondhand' } as never} onPress={jest.fn()} />);
  expect(used.getByTestId('listing-card-image').props.contentFit).toBe('contain');
});
