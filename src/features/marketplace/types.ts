import type { Timestamp } from '@core/types/common';

export type MarketplaceListingType = 'secondhand' | 'rental';

export type MarketplaceListing = {
  id: string;
  type: MarketplaceListingType;
  posterId: string;
  posterName: string;
  productName: string;
  location: string;
  price: number; // sale price for secondhand; daily rate for rental
  imageUrl: string | null;
  createdAt: Timestamp;
};
