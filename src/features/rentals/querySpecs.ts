/**
 * Every query the app makes on rentalItems and rentalCompanies, as plain data.
 *
 * This file is the single source for them: the hooks turn a spec into a
 * Firestore query (queries.ts), and scripts/probe-rental-rules.mjs imports this
 * same file (Node type stripping — so: no imports, no enums, no runtime TS
 * features) and runs exactly these queries against the rules. A query the app
 * makes that is not built here was never probed.
 *
 * The rules accept a list only when the query itself proves what it reads:
 * rentalItems needs where('visible','==',true), rentalCompanies needs
 * where('active','==',true). Admin queries need the admin claim.
 */

export type Clause =
  | { kind: 'where'; field: string; op: '==' | '<' | 'array-contains'; value: string | number | boolean }
  | { kind: 'orderBy'; field: string; dir: 'asc' | 'desc' }
  | { kind: 'limit'; n: number };

export type QuerySpec = { collection: 'rentalItems' | 'rentalCompanies'; clauses: Clause[] };

/** Items per page on the rental tab ("load more" fetches the next page). */
export const RENTAL_PAGE_SIZE = 30;
/** Partner companies shown on the rental tab. */
export const PARTNER_COMPANIES_LIMIT = 50;
/** sortPrice of a "price on request" item — same value as functions/src/rentals/types.ts. */
export const NO_PRICE_SORT = 1_000_000_000;
/** Longest search prefix the sync stores per word — same as functions/src/rentals/search.ts. */
export const SEARCH_PREFIX_MAX = 15;

export type RentalSort = 'name' | 'price_asc' | 'price_desc';

/**
 * The rental tab's items. Search uses one word (the longest typed one) on the
 * server and is sorted by name; the other words and any price order are applied
 * to the loaded results. "price on request" items have no place in a high→low
 * order and are left out of it.
 */
export function rentalItemsSpec(opts: {
  category?: string | null;
  sort?: RentalSort;
  searchKey?: string | null;
  pageSize?: number;
} = {}): QuerySpec {
  const clauses: Clause[] = [{ kind: 'where', field: 'visible', op: '==', value: true }];
  if (opts.category) clauses.push({ kind: 'where', field: 'category', op: '==', value: opts.category });
  const sort = opts.searchKey ? 'name' : opts.sort ?? 'name';
  if (opts.searchKey) clauses.push({ kind: 'where', field: 'searchKeys', op: 'array-contains', value: opts.searchKey });
  if (sort === 'price_asc') {
    clauses.push({ kind: 'orderBy', field: 'sortPrice', dir: 'asc' });
  } else if (sort === 'price_desc') {
    clauses.push({ kind: 'where', field: 'sortPrice', op: '<', value: NO_PRICE_SORT });
    clauses.push({ kind: 'orderBy', field: 'sortPrice', dir: 'desc' });
  } else {
    clauses.push({ kind: 'orderBy', field: 'name', dir: 'asc' });
  }
  clauses.push({ kind: 'limit', n: opts.pageSize ?? RENTAL_PAGE_SIZE });
  return { collection: 'rentalItems', clauses };
}

/** The partner row on the rental tab. */
export function partnerCompaniesSpec(): QuerySpec {
  return {
    collection: 'rentalCompanies',
    clauses: [
      { kind: 'where', field: 'active', op: '==', value: true },
      { kind: 'orderBy', field: 'name', dir: 'asc' },
      { kind: 'limit', n: PARTNER_COMPANIES_LIMIT },
    ],
  };
}

/** Admin: every company, inactive and removed included. */
export function adminCompaniesSpec(): QuerySpec {
  return { collection: 'rentalCompanies', clauses: [{ kind: 'orderBy', field: 'createdAt', dir: 'desc' }] };
}

/** Admin: every item of one company (preview, "Needs sorting"), hidden ones included. */
export function adminCompanyItemsSpec(companyId: string): QuerySpec {
  return { collection: 'rentalItems', clauses: [{ kind: 'where', field: 'companyId', op: '==', value: companyId }] };
}

/**
 * The search key for typed text: its longest word, normalised the way the sync
 * builds searchKeys (lower case, geresh and quote marks dropped, cut to
 * SEARCH_PREFIX_MAX). null when no word has two characters.
 */
export function searchKeyOf(text: string): string | null {
  const words = text
    .toLowerCase()
    .replace(/['"`׳״‘’“”]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return null;
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  return longest.slice(0, SEARCH_PREFIX_MAX);
}
