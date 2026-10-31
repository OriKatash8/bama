import { createHash } from 'crypto';
import {
  DESCRIPTION_MAX_CHARS, FETCH_RETRIES, FETCH_RETRY_BASE_MS, FETCH_TIMEOUT_MS, MAX_IMAGES_PER_ITEM,
  NAME_MAX_CHARS, WOO_MAX_PAGES, WOO_PER_PAGE,
} from './config';
import { cleanName, decodeEntities, stripHtml, truncate } from './text';

/** The WooCommerce Store API product fields the sync reads (wc/store/v1/products). */
export type WooProduct = {
  id: number;
  name: string;
  permalink: string;
  short_description?: string;
  description?: string;
  on_sale?: boolean;
  prices: {
    price: string;
    regular_price: string;
    sale_price: string;
    currency_code: string;
    currency_minor_unit: number;
  };
  images: { src: string }[];
  categories: { id: number; name: string; slug: string }[];
  is_in_stock: boolean;
};

/** One store product, in BAMA's terms. Everything the content hash covers. */
export type MappedItem = {
  externalId: string;
  externalUrl: string;
  name: string;
  description: string;
  /** Whole ₪ per day; null = "price on request" (the store lists 0 or no price). */
  pricePerDay: number | null;
  /** A real discount only: on sale AND below the regular price. */
  salePrice: number | null;
  inStock: boolean;
  externalCategories: string[];
  /** The store's image URLs this item uses (at most MAX_IMAGES_PER_ITEM). */
  imageSources: string[];
};

/** The products endpoint for a store's base URL (with or without a trailing slash or path). */
export function productsUrl(sourceUrl: string, page: number, perPage = WOO_PER_PAGE): string {
  const u = new URL(sourceUrl);
  const base = u.pathname.includes('/wp-json/')
    ? `${u.origin}${u.pathname.split('/wp-json/')[0]}`
    : `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  return `${base}/wp-json/wc/store/v1/products?per_page=${perPage}&page=${page}`;
}

/** A store amount in whole currency units: "200" with minor unit 0 is 200; "20000" with 2 is 200. */
export function toMajorUnits(raw: string | undefined, minorUnit: number): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = Number.isInteger(minorUnit) && minorUnit >= 0 && minorUnit <= 4 ? minorUnit : 0;
  return Math.round((n / 10 ** unit) * 100) / 100;
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Whether `url` is http(s) on the store's own host (or a subdomain of it). */
export function isOnHost(url: string, storeHost: string): boolean {
  const h = hostOf(url);
  return !!h && (h === storeHost || h.endsWith(`.${storeHost}`));
}

export function storeHostOf(sourceUrl: string): string {
  const h = hostOf(sourceUrl);
  if (!h) throw new Error(`Invalid store URL: ${sourceUrl}`);
  return h;
}

/**
 * Store product → MappedItem. Returns null for a product BAMA must not show:
 * a link off the store's own site, or one with no name.
 */
export function mapWooProduct(p: WooProduct, storeHost: string): MappedItem | null {
  if (!p || typeof p.id !== 'number') return null;
  const name = cleanName(p.name ?? '', NAME_MAX_CHARS);
  if (!name || !isOnHost(p.permalink ?? '', storeHost)) return null;

  const short = stripHtml(p.short_description ?? '');
  const description = truncate(short || stripHtml(p.description ?? ''), DESCRIPTION_MAX_CHARS);

  const prices = p.prices ?? ({} as WooProduct['prices']);
  const ils = (prices.currency_code ?? 'ILS') === 'ILS';
  const minor = prices.currency_minor_unit ?? 0;
  const regular = ils ? toMajorUnits(prices.regular_price || prices.price, minor) : null;
  const sale = ils ? toMajorUnits(prices.sale_price, minor) : null;
  const pricePerDay = regular && regular > 0 ? regular : null;
  const salePrice = pricePerDay != null && p.on_sale === true && sale != null && sale > 0 && sale < pricePerDay
    ? sale : null;

  const imageSources = (p.images ?? [])
    .map((i) => i?.src)
    .filter((src): src is string => typeof src === 'string' && /^https?:\/\//.test(src))
    .slice(0, MAX_IMAGES_PER_ITEM);

  return {
    externalId: String(p.id),
    externalUrl: p.permalink,
    name,
    description,
    pricePerDay,
    salePrice,
    inStock: p.is_in_stock !== false,
    externalCategories: (p.categories ?? []).map((c) => decodeEntities(c.name ?? '').trim()).filter(Boolean),
    imageSources,
  };
}

/** A stable hash of everything synced from the store; equal hash = nothing to write. */
export function contentHash(item: MappedItem): string {
  const ordered = [
    item.externalUrl, item.name, item.description, item.pricePerDay, item.salePrice, item.inStock,
    item.externalCategories, item.imageSources,
  ];
  return createHash('sha1').update(JSON.stringify(ordered)).digest('hex');
}

/** The hash of the images alone: they are re-copied only when this changes. */
export function imagesHash(sources: string[]): string {
  return createHash('sha1').update(JSON.stringify(sources)).digest('hex');
}

type FetchFn = typeof fetch;

async function fetchWithRetry(url: string, fetchFn: FetchFn): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, FETCH_RETRY_BASE_MS * 2 ** (attempt - 1)));
    try {
      const res = await fetchFn(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'BAMA-RentalSync/1.0' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      // 4xx other than 429 will not get better on retry.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Every product of a store, page by page (X-WP-TotalPages), capped at WOO_MAX_PAGES. */
export async function fetchAllProducts(sourceUrl: string, fetchFn: FetchFn = fetch): Promise<WooProduct[]> {
  const all: WooProduct[] = [];
  let totalPages = 1;
  for (let page = 1; page <= Math.min(totalPages, WOO_MAX_PAGES); page++) {
    const url = productsUrl(sourceUrl, page);
    const res = await fetchWithRetry(url, fetchFn);
    if (!res.ok) throw new Error(`Store API ${res.status} on page ${page}`);
    const body = await res.json();
    if (!Array.isArray(body)) throw new Error(`Store API returned no product list on page ${page}`);
    all.push(...(body as WooProduct[]));
    if (page === 1) {
      const header = Number(res.headers.get('x-wp-totalpages'));
      // No header: keep paging while pages come back full, until an empty one.
      totalPages = Number.isFinite(header) && header > 0
        ? header
        : body.length >= WOO_PER_PAGE ? WOO_MAX_PAGES : 1;
    }
    if (body.length === 0) break;
  }
  return all;
}
