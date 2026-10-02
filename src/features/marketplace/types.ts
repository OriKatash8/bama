import type { Timestamp } from '@core/types/common';

export type MarketplaceListingType = 'secondhand' | 'rental';

/** A rental's price is per day, week or month. */
export type RentalPeriod = 'day' | 'week' | 'month';

export type ProductCondition = 'new' | 'like_new' | 'good' | 'fair';

export type ListingStatus = 'available' | 'negotiating' | 'reserved' | 'sold';

export type MarketplaceListing = {
  id: string;
  type: MarketplaceListingType;
  posterId: string;
  posterName: string;
  productName: string;
  location: string;
  price: number; // sale price for secondhand; for rental, the rate per `pricePeriod`
  imageUrl: string | null;
  createdAt: Timestamp;
  condition?: ProductCondition;
  brand?: string;
  category?: string;
  /** One or more subcategories. Legacy listings stored a single string. */
  subcategory?: string | string[];
  status?: ListingStatus;
  reservedBy?: string;
  reservedAt?: Timestamp;
  // purchase flow
  buyerId?: string;
  purchaseChatId?: string;
  sellerConfirmed?: boolean;
  buyerConfirmed?: boolean;
  platformFee?: number;
  /** Rentals: the outside store that rents it, and its product page. A rental
   *  opens this page; it is never rented through the app or shown with its poster. */
  storeName?: string | null;
  productUrl?: string | null;
  /** Rentals: what `price` is charged per. Missing means per day (older rentals). */
  pricePeriod?: RentalPeriod;
  /** Community ids this listing has been shared to (market channels). */
  sharedTo?: string[];
};
