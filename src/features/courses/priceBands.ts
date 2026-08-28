// UI-only price bands for the Courses filter. Courses store only a raw numeric
// `price`; there are no price ranges in the data model. These bands are derived
// entirely from that number on the client — no schema change.

export type PriceBandId = 'all' | 'free' | 'low' | 'mid' | 'high';

export const PRICE_BANDS: { id: PriceBandId; labelKey: string; test: (p: number) => boolean }[] = [
  { id: 'all', labelKey: 'courses.price_all', test: () => true },
  { id: 'free', labelKey: 'courses.price_band_free', test: (p) => p === 0 },
  { id: 'low', labelKey: 'courses.price_band_low', test: (p) => p > 0 && p <= 200 },
  { id: 'mid', labelKey: 'courses.price_band_mid', test: (p) => p > 200 && p <= 1000 },
  { id: 'high', labelKey: 'courses.price_band_high', test: (p) => p > 1000 },
];

export function priceBandTest(id: PriceBandId): (p: number) => boolean {
  return (PRICE_BANDS.find((b) => b.id === id) ?? PRICE_BANDS[0]).test;
}
