import { platformOf } from '../platform';

/** Same rule as functions/src/rentals/platform.ts (functions/src/__tests__/rentalsManual.test.ts). */
it('missing → woocommerce; woocommerce; anything else → manual', () => {
  expect(platformOf({})).toBe('woocommerce');
  expect(platformOf({ sourceType: 'woocommerce' })).toBe('woocommerce');
  expect(platformOf({ sourceType: 'manual' })).toBe('manual');
  expect(platformOf({ sourceType: 'shopify' })).toBe('manual');
  expect(platformOf({ sourceType: 'Wix' })).toBe('manual');
});
