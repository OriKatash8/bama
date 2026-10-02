import { PERIOD_SUFFIX_KEY, RENTAL_PERIODS, dailyRate, periodOf, sortByPrice } from '../rentalPrice';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

it('a rental without a period is per day (older rentals)', () => {
  expect(periodOf({})).toBe('day');
  expect(periodOf({ pricePeriod: null })).toBe('day');
  expect(periodOf({ pricePeriod: 'month' })).toBe('month');
});

it('each period has its suffix and choice label, in both languages', () => {
  expect(RENTAL_PERIODS).toEqual(['day', 'week', 'month']);
  expect(RENTAL_PERIODS.map((p) => en.marketplace[PERIOD_SUFFIX_KEY[p]])).toEqual(['/day', '/week', '/month']);
  for (const p of RENTAL_PERIODS) {
    expect(he.marketplace[PERIOD_SUFFIX_KEY[p]]).toBeTruthy();
    expect(he.marketplace[`period_${p}` as const]).toBeTruthy();
    expect(he.marketplace[`price_${PERIOD_SUFFIX_KEY[p]}` as const]).toBeTruthy();
  }
});

it('compares per day: a week is 7 days, a month 30', () => {
  expect(dailyRate({ price: 70, pricePeriod: 'week' })).toBe(10);
  expect(dailyRate({ price: 300, pricePeriod: 'month' })).toBe(10);
  expect(dailyRate({ price: 10 })).toBe(10);
});

it('sorts rentals by their per-day price', () => {
  const a = { id: 'a', price: 100, pricePeriod: 'day' as const };   // 100/day
  const b = { id: 'b', price: 300, pricePeriod: 'week' as const };  // ≈43/day
  const c = { id: 'c', price: 900, pricePeriod: 'month' as const }; // 30/day
  expect(sortByPrice([a, b, c], 'asc').map((x) => x.id)).toEqual(['c', 'b', 'a']);
  expect(sortByPrice([a, b, c], 'desc').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  // 2nd-hand (no period) compares its price as is.
  expect(sortByPrice([{ id: 'x', price: 50 }, { id: 'y', price: 20 }], 'asc').map((x) => x.id)).toEqual(['y', 'x']);
});
