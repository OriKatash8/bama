import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import type { MarketplaceListing, MarketplaceListingType } from '../types';

export function useMarketplaceListings(type: MarketplaceListingType) {
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

  return { listings, isLoading };
}
