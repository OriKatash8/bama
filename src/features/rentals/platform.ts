/**
 * How the admin screen reads a company's `sourceType` — the same rule as the
 * server (functions/src/rentals/platform.ts): missing → WooCommerce, an
 * unrecognised value → manual (never synced).
 */
export type Platform = 'woocommerce' | 'manual';

export function platformOf(company: { sourceType?: unknown }): Platform {
  const v = company.sourceType;
  if (v === undefined || v === null || v === '') return 'woocommerce';
  return v === 'woocommerce' ? 'woocommerce' : 'manual';
}
