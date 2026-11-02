/**
 * How the admin screen reads a company's `sourceType` — the same rule as the
 * server (functions/src/rentals/platform.ts): missing → WooCommerce, a store
 * platform as is, anything unrecognised → manual (never synced).
 */
export type Platform = 'woocommerce' | 'shopify' | 'manual';

export function platformOf(company: { sourceType?: unknown }): Platform {
  const v = company.sourceType;
  if (v === undefined || v === null || v === '') return 'woocommerce';
  return v === 'woocommerce' || v === 'shopify' ? v : 'manual';
}

/** Whether the company's items come from its store (sync status, "Sync now", mapping, sorting). */
export function isSyncedPlatform(company: { sourceType?: unknown }): boolean {
  return platformOf(company) !== 'manual';
}
