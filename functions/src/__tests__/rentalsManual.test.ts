import { isSyncedPlatform, platformOf } from '../rentals/platform';
import {
  ManualItemError, manualMappedItem, newManualExternalId, parseManualItemInput,
} from '../rentals/manual';
import { isPublicHttpsUrl } from '../rentals/urls';

describe('platformOf (how a stored sourceType is read)', () => {
  it('missing means WooCommerce (companies saved before the field)', () => {
    expect(platformOf({})).toBe('woocommerce');
    expect(platformOf({ sourceType: null })).toBe('woocommerce');
    expect(platformOf({ sourceType: '' })).toBe('woocommerce');
  });
  it('the two known values', () => {
    expect(platformOf({ sourceType: 'woocommerce' })).toBe('woocommerce');
    expect(platformOf({ sourceType: 'manual' })).toBe('manual');
  });
  it('anything unrecognised is manual, and never synced', () => {
    for (const v of ['shopify', 'wix', 'WooCommerce', 42, { x: 1 }]) {
      expect(platformOf({ sourceType: v })).toBe('manual');
      expect(isSyncedPlatform({ sourceType: v })).toBe(false);
    }
    expect(isSyncedPlatform({})).toBe(true);
  });
});

describe('parseManualItemInput (content, not just shape)', () => {
  const UID = 'admin1';
  const ok = { companyId: 'co1', name: 'Sony FX3', pricePerDay: 250, category: 'camera' };

  it('a minimal valid item', () => {
    expect(parseManualItemInput(ok, UID)).toEqual({
      companyId: 'co1', itemId: null, name: 'Sony FX3', pricePerDay: 250, category: 'camera',
      description: '', productUrl: null, image: undefined,
    });
  });

  it('price: empty is "price on request"; numbers in range; strings are numbers', () => {
    expect(parseManualItemInput({ ...ok, pricePerDay: null }, UID).pricePerDay).toBeNull();
    expect(parseManualItemInput({ ...ok, pricePerDay: '' }, UID).pricePerDay).toBeNull();
    expect(parseManualItemInput({ ...ok, pricePerDay: '120' }, UID).pricePerDay).toBe(120);
    for (const bad of [0, -5, 100_001, 'abc', Infinity]) {
      expect(() => parseManualItemInput({ ...ok, pricePerDay: bad }, UID)).toThrow(ManualItemError);
    }
  });

  it('category: a BAMA category or hidden; never unsorted, Studios or Production', () => {
    expect(parseManualItemInput({ ...ok, category: 'hidden' }, UID).category).toBe('hidden');
    for (const bad of ['unsorted', 'studio', 'production', 'nope', '', undefined]) {
      expect(() => parseManualItemInput({ ...ok, category: bad }, UID)).toThrow('Bad category');
    }
  });

  it('name required and bounded; description bounded', () => {
    expect(() => parseManualItemInput({ ...ok, name: '  ' }, UID)).toThrow('name is required');
    expect(() => parseManualItemInput({ ...ok, name: 'x'.repeat(201) }, UID)).toThrow('name is too long');
    expect(() => parseManualItemInput({ ...ok, description: 'x'.repeat(501) }, UID)).toThrow('description is too long');
    expect(() => parseManualItemInput({ ...ok, name: 7 }, UID)).toThrow('name must be text');
  });

  it('product URL: https on a public host only', () => {
    expect(parseManualItemInput({ ...ok, productUrl: 'https://www.arielglikson.com/item/1' }, UID).productUrl)
      .toBe('https://www.arielglikson.com/item/1');
    for (const bad of ['http://shop.co.il/x', 'javascript:alert(1)', 'https://127.0.0.1/x', 'https://localhost/x', 'https://metadata.internal/x']) {
      expect(() => parseManualItemInput({ ...ok, productUrl: bad }, UID)).toThrow('productUrl');
    }
  });

  it('an edit can only name an item of the same company', () => {
    expect(parseManualItemInput({ ...ok, itemId: 'co1_m123' }, UID).itemId).toBe('co1_m123');
    expect(() => parseManualItemInput({ ...ok, itemId: 'co2_m123' }, UID)).toThrow('Bad itemId');
    expect(() => parseManualItemInput({ ...ok, itemId: 'co1_a/b' }, UID)).toThrow('Bad itemId');
  });

  it('image: keep (absent), clear (null), the caller\'s own upload, or an https URL', () => {
    expect(parseManualItemInput(ok, UID).image).toBeUndefined();
    expect(parseManualItemInput({ ...ok, image: null }, UID).image).toBeNull();
    expect(parseManualItemInput({ ...ok, image: { uploadPath: 'rentalUploads/admin1/abc' } }, UID).image)
      .toEqual({ uploadPath: 'rentalUploads/admin1/abc' });
    expect(parseManualItemInput({ ...ok, image: { url: 'https://cdn.example.com/a.jpg' } }, UID).image)
      .toEqual({ url: 'https://cdn.example.com/a.jpg' });
    // Someone else's upload, a path escape, or a non-public URL are refused.
    expect(() => parseManualItemInput({ ...ok, image: { uploadPath: 'rentalUploads/other/abc' } }, UID)).toThrow('own upload');
    expect(() => parseManualItemInput({ ...ok, image: { uploadPath: 'rentalUploads/admin1/../other/abc' } }, UID)).toThrow('own upload');
    expect(() => parseManualItemInput({ ...ok, image: { uploadPath: 'rentalCompanies/co1/items/x' } }, UID)).toThrow('own upload');
    expect(() => parseManualItemInput({ ...ok, image: { url: 'http://x.com/a.jpg' } }, UID)).toThrow('image URL');
    expect(() => parseManualItemInput({ ...ok, image: { other: 1 } }, UID)).toThrow('Bad image');
  });

  it('companyId is an id, not a path', () => {
    expect(() => parseManualItemInput({ ...ok, companyId: 'a/b' }, UID)).toThrow('Bad companyId');
  });
});

describe('manualMappedItem', () => {
  const input = parseManualItemInput({ companyId: 'co1', name: 'Aputure 600d', pricePerDay: 300, category: 'lighting' }, 'u');

  it('links to the product page, else the company site', () => {
    expect(manualMappedItem({ ...input, productUrl: 'https://s.co/p' }, 'm1', 'https://s.co', []).externalUrl).toBe('https://s.co/p');
    expect(manualMappedItem(input, 'm1', 'https://s.co', []).externalUrl).toBe('https://s.co');
  });

  it('with neither, there is nothing to link to', () => {
    expect(() => manualMappedItem(input, 'm1', null, [])).toThrow('product URL');
  });

  it('is in stock, never on sale, with no store categories', () => {
    expect(manualMappedItem(input, 'm1', 'https://s.co', ['upload'])).toEqual({
      externalId: 'm1', externalUrl: 'https://s.co', name: 'Aputure 600d', description: '', pricePerDay: 300,
      salePrice: null, inStock: true, externalCategories: [], imageSources: ['upload'],
    });
  });
});

describe('newManualExternalId', () => {
  it('is short, id-safe and distinct', () => {
    const a = newManualExternalId(1_800_000_000_000, 0.1);
    const b = newManualExternalId(1_800_000_000_000, 0.2);
    expect(a).toMatch(/^m[a-z0-9]{8,}$/);
    expect(a).not.toBe(b);
  });
});

describe('isPublicHttpsUrl', () => {
  it.each([
    ['https://shop.co.il/x', true], ['http://shop.co.il/x', false], ['https://10.0.0.1/', false],
    ['https://[::1]/', false], ['https://localhost/', false], ['https://intranet/', false], ['not a url', false],
  ])('%s → %s', (u, ok) => expect(isPublicHttpsUrl(u)).toBe(ok));
});
