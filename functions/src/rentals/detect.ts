import { DETECT_MAX_REDIRECTS, DETECT_TIMEOUT_MS } from './config';
import type { Platform } from './platform';
import { isPublicHttpsUrl } from './urls';
import type { FetchFn } from './woo';

/**
 * "Detect platform": which kind of store a site runs, found by asking the site
 * itself — server-side, because a browser would be stopped by CORS. Read-only:
 * it saves nothing. In order:
 *   1. /wp-json/wc/store/v1/products?per_page=1 answers a JSON list → 'woocommerce'
 *   2. /products.json?limit=1 answers { products: [...] }          → 'shopify'
 *   3. otherwise                                                   → 'manual'
 * Only https on a public host is ever requested, and a redirect is followed
 * only within the same site (example.com ↔ www.example.com); a redirect to any
 * other host stops that check.
 */

/** What a check found, as a code the admin screen translates (`result` is the English fallback). */
export type DetectCode =
  | 'woocommerce' | 'shopify' | 'not_woocommerce' | 'not_shopify'
  | 'redirect_other_site' | 'too_many_redirects' | 'unreachable' | 'timed_out' | 'not_public' | 'bad_redirect';
export type DetectCheck = { url: string; status: number | null; code: DetectCode; result: string };
export type DetectResult = { platform: Platform; storeUrl: string; checked: DetectCheck[] };

/** The site a host belongs to, for redirects: www. dropped, lower case. */
export function siteOf(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/** The address the admin typed, as an https origin — or null if it is not a public https site. */
export function normaliseStoreInput(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    // A web address only: any other scheme (ftp:, file:, …) is refused, not rewritten.
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const origin = `https://${u.host}`;
    return isPublicHttpsUrl(origin) ? origin : null;
  } catch {
    return null;
  }
}

type Fetched = { status: number | null; finalUrl: string; json: unknown; code?: DetectCode; note?: string };

/** GET a JSON URL, following at most DETECT_MAX_REDIRECTS redirects within the same site. */
export async function getJsonSameSite(url: string, fetchFn: FetchFn): Promise<Fetched> {
  const site = siteOf(new URL(url).host);
  let current = url;
  for (let hop = 0; hop <= DETECT_MAX_REDIRECTS; hop++) {
    if (!isPublicHttpsUrl(current)) return { status: null, finalUrl: current, json: null, code: 'not_public', note: 'not a public https address' };
    let res: Response;
    try {
      res = await fetchFn(current, {
        redirect: 'manual',
        headers: { Accept: 'application/json', 'User-Agent': 'BAMA-RentalDetect/1.0' },
        signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
      });
    } catch (e) {
      const timedOut = (e as Error).name === 'TimeoutError';
      return { status: null, finalUrl: current, json: null, code: timedOut ? 'timed_out' : 'unreachable', note: timedOut ? 'timed out' : 'unreachable' };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { status: res.status, finalUrl: current, json: null, code: 'bad_redirect', note: 'redirect without a location' };
      const next = new URL(location, current);
      if (siteOf(next.host) !== site) {
        return { status: res.status, finalUrl: current, json: null, code: 'redirect_other_site', note: `redirects to another site (${next.host})` };
      }
      current = next.toString();
      continue;
    }
    let json: unknown = null;
    try {
      json = JSON.parse(await res.text());
    } catch {
      json = null;
    }
    return { status: res.status, finalUrl: current, json };
  }
  return { status: null, finalUrl: current, json: null, code: 'too_many_redirects', note: 'too many redirects' };
}

export async function detectPlatform(input: string, fetchFn: FetchFn = fetch): Promise<DetectResult> {
  const origin = normaliseStoreInput(input);
  if (!origin) throw new Error('Enter the store\'s address, e.g. https://store.co.il');
  const checked: DetectCheck[] = [];

  const woo = await getJsonSameSite(`${origin}/wp-json/wc/store/v1/products?per_page=1`, fetchFn);
  const isWoo = woo.status === 200 && Array.isArray(woo.json);
  checked.push({
    url: woo.finalUrl, status: woo.status,
    code: isWoo ? 'woocommerce' : woo.code ?? 'not_woocommerce',
    result: isWoo ? 'WooCommerce store' : woo.note ?? 'not WooCommerce',
  });
  if (isWoo) return { platform: 'woocommerce', storeUrl: `${new URL(woo.finalUrl).origin}/`, checked };

  const shop = await getJsonSameSite(`${origin}/products.json?limit=1`, fetchFn);
  const products = (shop.json as { products?: unknown } | null)?.products;
  const isShopify = shop.status === 200 && Array.isArray(products);
  checked.push({
    url: shop.finalUrl, status: shop.status,
    code: isShopify ? 'shopify' : shop.code ?? 'not_shopify',
    result: isShopify ? 'Shopify store' : shop.note ?? 'not Shopify',
  });
  if (isShopify) return { platform: 'shopify', storeUrl: `${new URL(shop.finalUrl).origin}/`, checked };

  return { platform: 'manual', storeUrl: `${origin}/`, checked };
}
