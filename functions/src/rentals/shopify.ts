import {
  DESCRIPTION_MAX_CHARS, MAX_IMAGES_PER_ITEM, NAME_MAX_CHARS, SHOPIFY_MAX_CATEGORIES, SHOPIFY_MAX_PAGES,
  SHOPIFY_PER_PAGE,
} from './config';
import { cleanName, decodeEntities, stripHtml, truncate } from './text';
import { fetchWithRetry, type FetchFn, type MappedItem } from './woo';

/**
 * A Shopify store, read through its public storefront JSON:
 *   https://HOST/products.json?limit=250&page=N   — the products, page by page
 *   https://HOST/meta.json                         — the shop's currency
 * Mirrors woo.ts: the products become MappedItems, and everything after that
 * (upserts, images, categories, removal, counts) is the shared sync.
 */

/** The products.json fields the sync reads. */
export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  product_type?: string | null;
  /** An array on most stores; a comma-separated string on older ones. */
  tags?: string[] | string | null;
  variants?: { price?: string | null; compare_at_price?: string | null; available?: boolean }[];
  images?: { src?: string }[];
};

/** The store's origin from its address as the admin entered it (scheme + host, keeping www). */
export function shopifyOrigin(sourceUrl: string): string {
  const u = new URL(sourceUrl);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`Invalid store URL: ${sourceUrl}`);
  return `https://${u.host}`;
}

export function shopifyProductsUrl(sourceUrl: string, page: number, perPage = SHOPIFY_PER_PAGE): string {
  return `${shopifyOrigin(sourceUrl)}/products.json?limit=${perPage}&page=${page}`;
}

/** "350.00" → 350; empty, negative or not a number → null. */
export function shopifyAmount(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function tagsOf(tags: ShopifyProduct['tags']): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') return tags.split(',');
  return [];
}

/**
 * products.json product → MappedItem. `ils` is whether the shop prices in ₪
 * (meta.json): other currencies (or an unknown one) give "price unknown".
 * The price is the cheapest available variant's (else the cheapest variant's);
 * a higher compare_at_price on that variant makes it a sale.
 */
export function mapShopifyProduct(p: ShopifyProduct, origin: string, ils: boolean): MappedItem | null {
  if (!p || typeof p.id !== 'number' || typeof p.handle !== 'string' || !p.handle) return null;
  const name = cleanName(p.title ?? '', NAME_MAX_CHARS);
  if (!name) return null;

  const variants = (p.variants ?? []).filter((v) => shopifyAmount(v.price) != null);
  const pool = variants.some((v) => v.available) ? variants.filter((v) => v.available) : variants;
  const cheapest = pool.reduce<(typeof pool)[number] | null>(
    (best, v) => (best == null || shopifyAmount(v.price)! < shopifyAmount(best.price)! ? v : best), null);

  let pricePerDay: number | null = null;
  let salePrice: number | null = null;
  if (ils && cheapest) {
    const price = shopifyAmount(cheapest.price)!;
    const compareAt = shopifyAmount(cheapest.compare_at_price);
    if (price > 0) {
      if (compareAt != null && compareAt > price) {
        pricePerDay = compareAt;
        salePrice = price;
      } else {
        pricePerDay = price;
      }
    }
  }

  const categories = [p.product_type ?? '', ...tagsOf(p.tags)]
    .map((c) => decodeEntities(String(c)).trim())
    .filter(Boolean);
  const externalCategories = [...new Set(categories)].slice(0, SHOPIFY_MAX_CATEGORIES);

  return {
    externalId: String(p.id),
    externalUrl: `${origin}/products/${encodeURIComponent(p.handle)}`,
    name,
    description: truncate(stripHtml(p.body_html ?? ''), DESCRIPTION_MAX_CHARS),
    pricePerDay,
    salePrice,
    inStock: (p.variants ?? []).some((v) => v.available === true),
    externalCategories,
    imageSources: (p.images ?? [])
      .map((i) => i?.src)
      .filter((src): src is string => typeof src === 'string' && /^https:\/\//.test(src))
      .slice(0, MAX_IMAGES_PER_ITEM),
  };
}

/** The shop's currency from meta.json, or null when it cannot be read. */
export async function fetchShopifyCurrency(sourceUrl: string, fetchFn: FetchFn = fetch): Promise<string | null> {
  try {
    const res = await fetchWithRetry(`${shopifyOrigin(sourceUrl)}/meta.json`, fetchFn);
    if (!res.ok) return null;
    const body = (await res.json()) as { currency?: unknown };
    return typeof body?.currency === 'string' ? body.currency.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Every product of the store, page by page until a short or empty page (capped at SHOPIFY_MAX_PAGES). */
export async function fetchAllShopifyProducts(sourceUrl: string, fetchFn: FetchFn = fetch): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= SHOPIFY_MAX_PAGES; page++) {
    const res = await fetchWithRetry(shopifyProductsUrl(sourceUrl, page), fetchFn);
    if (!res.ok) throw new Error(`Shopify products.json ${res.status} on page ${page}`);
    const body = (await res.json()) as { products?: unknown };
    if (!body || !Array.isArray(body.products)) throw new Error(`Shopify returned no product list on page ${page}`);
    all.push(...(body.products as ShopifyProduct[]));
    if (body.products.length < SHOPIFY_PER_PAGE) break;
  }
  return all;
}

/** The store's products as MappedItems (deduplicated by id), for the shared sync. */
export async function fetchShopifyMapped(sourceUrl: string, fetchFn: FetchFn = fetch): Promise<{ fetched: number; items: MappedItem[] }> {
  const [products, currency] = await Promise.all([
    fetchAllShopifyProducts(sourceUrl, fetchFn),
    fetchShopifyCurrency(sourceUrl, fetchFn),
  ]);
  const origin = shopifyOrigin(sourceUrl);
  const items: MappedItem[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const m = mapShopifyProduct(p, origin, currency === 'ILS');
    if (m && !seen.has(m.externalId)) { seen.add(m.externalId); items.push(m); }
  }
  return { fetched: products.length, items };
}
