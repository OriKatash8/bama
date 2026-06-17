import { useState, useEffect } from 'react';
import { subscribeToCollection, where } from '@core/firebase/firestore';
import type { MarketplaceListing, MarketplaceListingType } from '../types';

export function useMarketplaceListings(type: MarketplaceListingType) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    return subscribeToCollection<MarketplaceListing>(
      'marketplace_listings',
      (data) => {
        const sorted = [...data].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        setListings(sorted);
        setIsLoading(false);
      },
      where('type', '==', type)
    );
  }, [type]);

  return { listings, isLoading };
}
