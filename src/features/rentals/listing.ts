import type { MarketplaceListing } from '@features/marketplace/types';
import type { RentalItem } from './types';

/** The marketplace's id for a company item: never collides with a listing id. */
export const COMPANY_LISTING_PREFIX = 'rental:';

/**
 * A synced company item as a marketplace listing, so the rental tab's grid,
 * filters, price sort and detail screen take it like any rental. It has no
 * poster (companies are not app users): `posterId` is empty, which keeps it out
 * of every owner and purchase path. The grid gets the thumbnail; the detail
 * screen gets `detailImageUrl`. `productUrl` is the link with BAMA's UTM.
 */
export function rentalItemToListing(item: RentalItem): MarketplaceListing {
  const image = item.images?.[0];
  return {
    id: `${COMPANY_LISTING_PREFIX}${item.id}`,
    type: 'rental',
    posterId: '',
    posterName: item.companyName,
    productName: item.name,
    location: item.companyCity,
    price: item.salePrice ?? item.pricePerDay ?? 0,
    imageUrl: image?.thumbUrl ?? null,
    createdAt: { seconds: 0, nanoseconds: 0 },
    category: item.category,
    status: 'available',
    storeName: item.companyName,
    productUrl: item.linkUrl,
    pricePeriod: 'day',
    source: 'company',
    companyId: item.companyId,
    rentalItemId: item.id,
    priceOnRequest: item.pricePerDay == null,
    inStock: item.inStock,
    regularPrice: item.salePrice != null ? item.pricePerDay : null,
    detailImageUrl: image?.url ?? null,
    description: item.description,
  };
}

export function isCompanyListing(l: Pick<MarketplaceListing, 'source'>): boolean {
  return l.source === 'company';
}
