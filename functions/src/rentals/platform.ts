/**
 * Where a company's items come from, read from its `sourceType`.
 *
 *   - missing            → 'woocommerce' (companies saved before the field existed)
 *   - 'woocommerce'      → synced from the store's WooCommerce Store API
 *   - 'shopify'          → synced from the store's public products.json
 *   - 'manual'           → entered by the admin, never synced
 *   - anything else      → 'manual': an unknown value must never trigger a sync
 *
 * Every reader (the sync, the scheduler, the admin screen) goes through this,
 * so a stored value is interpreted the same way everywhere.
 */
export type Platform = 'woocommerce' | 'shopify' | 'manual';

/** The platforms the sync reads from a store. */
export const SYNCED_PLATFORMS: readonly Platform[] = ['woocommerce', 'shopify'];

export function platformOf(company: { sourceType?: unknown }): Platform {
  const v = company.sourceType;
  if (v === undefined || v === null || v === '') return 'woocommerce';
  if (v === 'woocommerce' || v === 'shopify') return v;
  return 'manual';
}

/** Whether the sync (and the scheduler) may read this company's store. */
export function isSyncedPlatform(company: { sourceType?: unknown }): boolean {
  return SYNCED_PLATFORMS.includes(platformOf(company));
}
