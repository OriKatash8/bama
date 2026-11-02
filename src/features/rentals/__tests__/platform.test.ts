import { isSyncedPlatform, platformOf } from '../platform';

/** Same rule as functions/src/rentals/platform.ts (functions/src/__tests__/rentalsManual + rentalsShopify tests). */
it('missing → woocommerce; woocommerce and shopify as is; anything else → manual', () => {
  expect(platformOf({})).toBe('woocommerce');
  expect(platformOf({ sourceType: 'woocommerce' })).toBe('woocommerce');
  expect(platformOf({ sourceType: 'shopify' })).toBe('shopify');
  expect(platformOf({ sourceType: 'manual' })).toBe('manual');
  expect(platformOf({ sourceType: 'Wix' })).toBe('manual');
});

it('only the store platforms are synced', () => {
  expect(isSyncedPlatform({ sourceType: 'shopify' })).toBe(true);
  expect(isSyncedPlatform({})).toBe(true);
  expect(isSyncedPlatform({ sourceType: 'manual' })).toBe(false);
  expect(isSyncedPlatform({ sourceType: 'something' })).toBe(false);
});
