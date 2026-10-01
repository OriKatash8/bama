import type { MarketplaceListingType } from '../types';

export type MarketEmptyCase = 'market' | 'rental' | 'filtered';

/**
 * Which empty state the marketplace shows. `total` is everything listed on the
 * tab, `shown` what is left after search, category and filters. Nothing listed
 * at all → that tab's own message; listings hidden by the search → 'filtered'.
 */
export function emptyCase({ tab, isLoading, total, shown }: {
  tab: MarketplaceListingType; isLoading: boolean; total: number; shown: number;
}): MarketEmptyCase | null {
  if (isLoading || shown > 0) return null;
  if (total > 0) return 'filtered';
  return tab === 'rental' ? 'rental' : 'market';
}
