import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import { useBlockStore } from '@core/stores/blockStore';
import { useAuthStore } from '@core/stores/authStore';
import { useDemoStore } from '@core/stores/demoStore';
import { isSameSide } from '@core/demo/demoSides';
import type { MarketplaceListing, MarketplaceListingType } from '../types';

export function useMarketplaceListings(type: MarketplaceListingType) {
  const blocked = useBlockStore((s) => s.blocked);
  const me = useAuthStore((s) => s.user?.id);
  const demo = useDemoStore((s) => s.config);
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
  //
  // Demo accounts (App Review) and real users never see each other's listings — demoSides.ts.
  const visible = listings.filter(
    (l) => !blocked.includes(l.posterId) && isSameSide(demo, me, l.posterId),
  );

  return { listings: visible, isLoading };
}
