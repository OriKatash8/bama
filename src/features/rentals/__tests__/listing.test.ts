import { rentalItemToListing } from '../listing';
import type { RentalItem } from '../types';

const ITEM: RentalItem = {
  id: 'co_11197', companyId: 'co', companyName: 'RentCam', companyCity: 'תל אביב', source: 'company',
  externalId: '11197', externalUrl: 'https://store.example/p/', linkUrl: 'https://store.example/p/?utm_source=bama',
  name: 'Aputure 600d', description: 'A light', pricePerDay: 250, salePrice: null, sortPrice: 250, inStock: true,
  externalCategories: ['ציוד תאורה להשכרה'], category: 'lighting', suggestedCategory: 'lighting', manualCategory: null,
  active: true, visible: true, images: [{ thumbUrl: 'https://img/t.webp', url: 'https://img/d.webp' }], clicks: 0,
};

describe('rentalItemToListing', () => {
  it('is a rental with no poster, the company as its store, and the UTM link', () => {
    const l = rentalItemToListing(ITEM);
    expect(l).toMatchObject({
      id: 'rental:co_11197', type: 'rental', posterId: '', storeName: 'RentCam', location: 'תל אביב',
      productUrl: 'https://store.example/p/?utm_source=bama', pricePeriod: 'day', category: 'lighting',
      source: 'company', companyId: 'co', rentalItemId: 'co_11197', price: 250, priceOnRequest: false, inStock: true,
    });
  });

  it('the grid gets the thumbnail; the detail screen the large image', () => {
    const l = rentalItemToListing(ITEM);
    expect(l.imageUrl).toBe('https://img/t.webp');
    expect(l.detailImageUrl).toBe('https://img/d.webp');
    expect(rentalItemToListing({ ...ITEM, images: [] }).imageUrl).toBeNull();
  });

  it('no price is "price on request", never a real ₪0', () => {
    const l = rentalItemToListing({ ...ITEM, pricePerDay: null, sortPrice: 1e9 });
    expect(l.priceOnRequest).toBe(true);
    expect(l.price).toBe(0);
  });

  it('on sale: price is the sale price, regularPrice the old one', () => {
    const l = rentalItemToListing({ ...ITEM, salePrice: 200 });
    expect(l.price).toBe(200);
    expect(l.regularPrice).toBe(250);
    expect(rentalItemToListing(ITEM).regularPrice).toBeNull();
  });
});
