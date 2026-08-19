import type { Timestamp } from '@core/types/common';

export type MarketplaceListingType = 'secondhand' | 'rental';

export type ProductCondition = 'new' | 'like_new' | 'good' | 'fair';

export type ListingStatus = 'available' | 'negotiating' | 'reserved' | 'sold';

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
  condition?: ProductCondition;
  brand?: string;
  category?: string;
  subcategory?: string;
  status?: ListingStatus;
  reservedBy?: string;
  reservedAt?: Timestamp;
  // purchase flow
  buyerId?: string;
  purchaseChatId?: string;
  sellerConfirmed?: boolean;
  buyerConfirmed?: boolean;
  platformFee?: number;
};
