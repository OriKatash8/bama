import {
  fetchAllShopifyProducts, fetchShopifyCurrency, fetchShopifyMapped, mapShopifyProduct, shopifyAmount,
  shopifyOrigin, shopifyProductsUrl, type ShopifyProduct,
} from '../rentals/shopify';
import { detectPlatform, getJsonSameSite, normaliseStoreInput, siteOf } from '../rentals/detect';
import { isSyncedPlatform, platformOf } from '../rentals/platform';

const ORIGIN = 'https://www.shop.co.il';

/** Shaped like a real products.json product (fields as Shopify returns them). */
function product(over: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 7001,
    title: 'Sony FX3 &amp; cage',
    handle: 'sony-fx3',
    body_html: '<p>Body <strong>only</strong></p>',
    product_type: 'Cameras',
    tags: ['Sony', 'Cinema'],
    variants: [
      { price: '450.00', compare_at_price: null, available: false },
      { price: '350.00', compare_at_price: '400.00', available: true },
      { price: '380.00', compare_at_price: null, available: true },
    ],
    images: [{ src: 'https://cdn.shopify.com/a.jpg' }, { src: 'https://cdn.shopify.com/b.jpg' }, { src: 'https://cdn.shopify.com/c.jpg' }],
    ...over,
  };
}

describe('platformOf with Shopify', () => {
  it('shopify is a known, synced platform; manual and unknown values are not synced', () => {
    expect(platformOf({ sourceType: 'shopify' })).toBe('shopify');
    expect(isSyncedPlatform({ sourceType: 'shopify' })).toBe(true);
    expect(isSyncedPlatform({ sourceType: 'woocommerce' })).toBe(true);
    expect(isSyncedPlatform({})).toBe(true);
    expect(isSyncedPlatform({ sourceType: 'manual' })).toBe(false);
    expect(platformOf({ sourceType: 'Shopify' })).toBe('manual'); // exact value only
  });
});

describe('mapShopifyProduct', () => {
  it('maps the products.json shape', () => {
    expect(mapShopifyProduct(product(), ORIGIN, true)).toEqual({
      externalId: '7001',
      externalUrl: 'https://www.shop.co.il/products/sony-fx3',
      name: 'Sony FX3 & cage',
      description: 'Body only',
      // The cheapest AVAILABLE variant (350), on sale from its compare_at_price (400).
      pricePerDay: 400,
      salePrice: 350,
      inStock: true,
      externalCategories: ['Cameras', 'Sony', 'Cinema'],
      imageSources: ['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg'], // max 2
    });
  });

  it('no available variant: the cheapest variant, out of stock', () => {
    const m = mapShopifyProduct(product({ variants: [{ price: '90.00', available: false }, { price: '70', available: false }] }), ORIGIN, true)!;
    expect(m.pricePerDay).toBe(70);
    expect(m.salePrice).toBeNull();
    expect(m.inStock).toBe(false);
  });

  it('a shop not in ₪ (or of unknown currency) gives "price unknown"', () => {
    const m = mapShopifyProduct(product(), ORIGIN, false)!;
    expect(m.pricePerDay).toBeNull();
    expect(m.salePrice).toBeNull();
  });

  it('price 0 or no price is "price unknown", never ₪0', () => {
    expect(mapShopifyProduct(product({ variants: [{ price: '0.00', available: true }] }), ORIGIN, true)!.pricePerDay).toBeNull();
    expect(mapShopifyProduct(product({ variants: [] }), ORIGIN, true)!.pricePerDay).toBeNull();
  });

  it('tags as a comma string (older stores), deduplicated, capped at 10 with the product type first', () => {
    const tags = Array.from({ length: 15 }, (_, i) => `t${i}`).join(', ') + ', Cameras';
    const m = mapShopifyProduct(product({ tags }), ORIGIN, true)!;
    expect(m.externalCategories).toHaveLength(10);
    expect(m.externalCategories[0]).toBe('Cameras');
    expect(m.externalCategories.filter((c) => c === 'Cameras')).toHaveLength(1);
  });

  it('the handle is URL-encoded into the product page', () => {
    expect(mapShopifyProduct(product({ handle: 'עדשה-50' }), ORIGIN, true)!.externalUrl)
      .toBe(`${ORIGIN}/products/${encodeURIComponent('עדשה-50')}`);
  });

  it('drops a product with no id, handle or name; keeps https images only', () => {
    expect(mapShopifyProduct(product({ handle: '' }), ORIGIN, true)).toBeNull();
    expect(mapShopifyProduct(product({ title: '  ' }), ORIGIN, true)).toBeNull();
    expect(mapShopifyProduct(product({ images: [{ src: 'http://x/a.jpg' }, { src: 'https://cdn/b.jpg' }] }), ORIGIN, true)!.imageSources)
      .toEqual(['https://cdn/b.jpg']);
  });

  it('amounts', () => {
    expect(shopifyAmount('350.00')).toBe(350);
    expect(shopifyAmount('12.345')).toBe(12.35);
    expect(shopifyAmount('-1')).toBeNull();
    expect(shopifyAmount('abc')).toBeNull();
    expect(shopifyAmount(null)).toBeNull();
  });

  it('store URLs: the origin as entered (www kept), always https', () => {
    expect(shopifyOrigin('http://www.shop.co.il/collections/all')).toBe('https://www.shop.co.il');
    expect(shopifyProductsUrl('https://shop.co.il/', 3)).toBe('https://shop.co.il/products.json?limit=250&page=3');
  });
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('fetching a Shopify store', () => {
  it('pages until a short page', async () => {
    const pages: Record<number, number> = { 1: 250, 2: 250, 3: 7 };
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      const page = Number(new URL(url).searchParams.get('page'));
      return jsonResponse({ products: Array.from({ length: pages[page] ?? 0 }, (_, i) => product({ id: page * 1000 + i })) });
    }) as unknown as typeof fetch;
    const all = await fetchAllShopifyProducts('https://shop.co.il', fake);
    expect(all).toHaveLength(507);
    expect(calls).toHaveLength(3);
  });

  it('a response that is not a product list fails the sync (nothing is written)', async () => {
    const fake = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    await expect(fetchAllShopifyProducts('https://shop.co.il', fake)).rejects.toThrow();
  });

  it('reads the currency from meta.json; unreadable → null', async () => {
    expect(await fetchShopifyCurrency('https://shop.co.il', (async () => jsonResponse({ currency: 'ils' })) as unknown as typeof fetch)).toBe('ILS');
    expect(await fetchShopifyCurrency('https://shop.co.il', (async () => new Response('x', { status: 404 })) as unknown as typeof fetch)).toBeNull();
  });

  it('maps and deduplicates; prices only for a ₪ shop', async () => {
    const fake = (async (url: string) => (url.endsWith('/meta.json')
      ? jsonResponse({ currency: 'ILS' })
      : jsonResponse({ products: [product(), product(), product({ id: 2, handle: 'b' })] }))) as unknown as typeof fetch;
    const { fetched, items } = await fetchShopifyMapped('https://www.shop.co.il/', fake);
    expect(fetched).toBe(3);
    expect(items.map((i) => i.externalId)).toEqual(['7001', '2']);
    expect(items[0].pricePerDay).toBe(400);
  });
});

describe('detect platform', () => {
  /** A fake web: path → response; anything else 404 HTML (like a Wix site). */
  function site(routes: Record<string, () => Response>): typeof fetch {
    return (async (url: string) => {
      const u = new URL(url);
      const key = `${u.host}${u.pathname}`;
      return routes[key]?.() ?? new Response('<!DOCTYPE html>', { status: 404, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof fetch;
  }

  it('WooCommerce: the Store API answers a JSON list', async () => {
    const r = await detectPlatform('lens4rent.biz', site({ 'lens4rent.biz/wp-json/wc/store/v1/products': () => jsonResponse([{ id: 1 }]) }));
    expect(r.platform).toBe('woocommerce');
    expect(r.storeUrl).toBe('https://lens4rent.biz/');
    expect(r.checked).toHaveLength(1);
  });

  it('Shopify: products.json answers { products }', async () => {
    const r = await detectPlatform('https://shop.co.il', site({ 'shop.co.il/products.json': () => jsonResponse({ products: [] }) }));
    expect(r.platform).toBe('shopify');
    expect(r.checked.map((c) => c.result)).toEqual(['not WooCommerce', 'Shopify store']);
    expect(r.checked.map((c) => c.code)).toEqual(['not_woocommerce', 'shopify']);
  });

  it('neither (a Wix site): manual, with what was checked', async () => {
    const r = await detectPlatform('https://www.arielglikson.com/', site({}));
    expect(r.platform).toBe('manual');
    expect(r.checked.map((c) => c.status)).toEqual([404, 404]);
  });

  it('follows a redirect within the same site (apex → www) and returns the final address', async () => {
    const r = await detectPlatform('shop.co.il', site({
      'shop.co.il/products.json': () => new Response(null, { status: 301, headers: { location: 'https://www.shop.co.il/products.json?limit=1' } }),
      'www.shop.co.il/products.json': () => jsonResponse({ products: [{ id: 1 }] }),
    }));
    expect(r.platform).toBe('shopify');
    expect(r.storeUrl).toBe('https://www.shop.co.il/');
  });

  it('a redirect to another site is not followed', async () => {
    const r = await detectPlatform('shop.co.il', site({
      'shop.co.il/products.json': () => new Response(null, { status: 302, headers: { location: 'https://evil.example/products.json' } }),
      'evil.example/products.json': () => jsonResponse({ products: [] }),
    }));
    expect(r.platform).toBe('manual');
    expect(r.checked[1].result).toBe('redirects to another site (evil.example)');
    expect(r.checked[1].code).toBe('redirect_other_site');
  });

  it('a redirect to an internal address is not followed', async () => {
    const r = await getJsonSameSite('https://shop.co.il/x', site({
      'shop.co.il/x': () => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest' } }),
    }));
    expect(r.json).toBeNull();
    expect(r.note).toMatch(/another site/);
  });

  it('redirect loops stop', async () => {
    const r = await getJsonSameSite('https://shop.co.il/x', site({
      'shop.co.il/x': () => new Response(null, { status: 302, headers: { location: 'https://www.shop.co.il/x' } }),
      'www.shop.co.il/x': () => new Response(null, { status: 302, headers: { location: 'https://shop.co.il/x' } }),
    }));
    expect(r.note).toBe('too many redirects');
  });

  it('an unreachable site is manual, not an error', async () => {
    const r = await detectPlatform('shop.co.il', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    expect(r.platform).toBe('manual');
    expect(r.checked.map((c) => c.code)).toEqual(['unreachable', 'unreachable']);
  });

  it('refuses addresses that are not public https sites', async () => {
    for (const bad of ['', 'localhost', 'http://10.0.0.1', 'https://127.0.0.1:8080', 'intranet', 'ftp://x.com']) {
      await expect(detectPlatform(bad, site({}))).rejects.toThrow();
    }
    expect(normaliseStoreInput('http://Shop.co.il/path?q=1')).toBe('https://shop.co.il');
    expect(siteOf('WWW.Shop.co.il')).toBe('shop.co.il');
  });
});
