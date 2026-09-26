import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import { useBlockStore } from '@core/stores/blockStore';
import type { MarketplaceListing, MarketplaceListingType } from '../types';

export function useMarketplaceListings(type: MarketplaceListingType) {
  const blocked = useBlockStore((s) => s.blocked);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    return subscribeToCollection<MarketplaceListing>(
      'marketplace_listings',
      (data) => {
        const available = data.filter(
          (l) => l.status !== 'negotiating' && l.status !== 'reserved' && l.status !== 'sold'
        );
        const sorted = [...available].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setListings(sorted);
        setIsLoading(false);
      },
      where('type', '==', type)
    );
  }, [type]);

  // A blocked user's listings disappear from the feed: the marketplace is a
  // stranger-to-stranger surface, and "block" that still shows you their items
  // (with a Talk to the Seller button) is not a block.
  const visible = blocked.length === 0
    ? listings
    : listings.filter((l) => !blocked.includes(l.posterId));

  return { listings: visible, isLoading };
}
