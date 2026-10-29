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
  /**
   * Set only on a rental company's synced item shown in the rental tab
   * (src/features/rentals/listing.ts). Such a listing is not a document in
   * marketplace_listings and has no poster.
   */
  source?: 'company';
  companyId?: string;
  rentalItemId?: string;
  /** The store lists no price: show "price on request", never ₪0. */
  priceOnRequest?: boolean;
  inStock?: boolean;
  /** On sale: `price` is the sale price and this is the regular one. */
  regularPrice?: number | null;
  /** The large image for the detail screen; `imageUrl` is the grid thumbnail. */
  detailImageUrl?: string | null;
  description?: string;
};
