import type { RentalPeriod } from '../types';

export const RENTAL_PERIODS: RentalPeriod[] = ['day', 'week', 'month'];

/** The `marketplace.*` key of each period's price suffix ("/day", "/week", "/month"). */
export const PERIOD_SUFFIX_KEY: Record<RentalPeriod, 'per_day' | 'per_week' | 'per_month'> = {
  day: 'per_day',
  week: 'per_week',
  month: 'per_month',
};

const DAYS: Record<RentalPeriod, number> = { day: 1, week: 7, month: 30 };

/** A rental's period; older rentals have none and are per day. */
export function periodOf(l: { pricePeriod?: RentalPeriod | null }): RentalPeriod {
  return l.pricePeriod ?? 'day';
}

/** The price per day, so rentals priced per day, week and month sort together. */
export function dailyRate(l: { price: number; pricePeriod?: RentalPeriod | null }): number {
  return l.price / DAYS[periodOf(l)];
}

/**
 * Listings by price, low → high or high → low. Rentals compare per day, so
 * ₪300/week (≈43/day) sorts below ₪100/day; 2nd-hand prices are compared as is.
 */
export function sortByPrice<T extends { price: number; pricePeriod?: RentalPeriod | null }>(
  list: T[],
  dir: 'asc' | 'desc',
): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => sign * (dailyRate(a) - dailyRate(b)));
}
