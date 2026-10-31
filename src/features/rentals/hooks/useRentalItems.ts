import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocs, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { toQuery } from '../queries';
import { rentalItemsSpec, searchKeyOf, RENTAL_PAGE_SIZE, type RentalSort } from '../querySpecs';
import type { RentalItem } from '../types';

export type RentalItemsFilter = {
  category?: string | null;
  companyId?: string | null;
  sort?: RentalSort;
  /** The search box's text. */
  search?: string;
  /** Brand filter: a company item matches when one of these is in its name. */
  brands?: string[];
  /** false = no query at all (e.g. a demo account, or the second-hand tab). */
  enabled?: boolean;
};

/** Lower-case words of a text, the way names are compared on the client. */
function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
}

/**
 * What the server cannot check on the loaded page: every typed word in the name
 * (the server matched one), and — when search took the one array clause — a
 * brand in the name.
 */
export function matchesLoaded(item: Pick<RentalItem, 'name'>, search: string, brands: string[]): boolean {
  const name = item.name.toLowerCase();
  if (!words(search).every((w) => name.includes(w))) return false;
  if (search.trim() && brands.length > 0) return brands.some((b) => name.includes(b.toLowerCase()));
  return true;
}

/**
 * The rental tab's company items, a page at a time (RENTAL_PAGE_SIZE, `getDocs`
 * + `startAfter`, never a listener: items change only when a sync runs). The
 * query is built from querySpecs.ts — the same specs the rules probe runs.
 * Changing any filter starts again from the first page; a page that arrives
 * after the filters changed is dropped.
 */
export function useRentalItems(filter: RentalItemsFilter) {
  const { category = null, companyId = null, sort = 'name', search = '', brands = [], enabled = true } = filter;
  const brandsKey = brands.join('\u0000');
  const spec = useMemo(() => {
    const searchKey = searchKeyOf(search);
    const brandKeys = searchKey ? [] : [...new Set(brands.map(searchKeyOf).filter((k): k is string => !!k))];
    return rentalItemsSpec({ category, companyId, sort, searchKey, brandKeys });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, companyId, sort, search, brandsKey]);
  const specKey = JSON.stringify(spec);

  // Every result carries the key of the query it answers: a stale page can then
  // never show for new filters, and "loading" is simply "no answer for this key yet".
  const [page, setPage] = useState<{ key: string; items: RentalItem[]; hasMore: boolean; error: string | null }>(
    { key: '', items: [], hasMore: false, error: null },
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const cursor = useRef<QueryDocumentSnapshot | null>(null);
  const current = useRef(specKey);

  useEffect(() => {
    current.current = specKey;
    cursor.current = null;
    if (!enabled) return;
    getDocs(toQuery(db, spec))
      .then((snap) => {
        if (current.current !== specKey) return;
        cursor.current = snap.docs[snap.docs.length - 1] ?? null;
        setPage({
          key: specKey,
          items: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RentalItem),
          hasMore: snap.docs.length === RENTAL_PAGE_SIZE,
          error: null,
        });
      })
      .catch((e: Error) => {
        if (current.current === specKey) setPage({ key: specKey, items: [], hasMore: false, error: e.message });
      });
    // spec is derived from specKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, enabled]);

  const answered = enabled && page.key === specKey;
  const items = answered ? page.items : [];
  const hasMore = answered && page.hasMore;
  const loading = enabled && !answered;

  const loadMore = useCallback(() => {
    if (!answered || !hasMore || loadingMore || !cursor.current) return;
    const key = specKey;
    setLoadingMore(true);
    getDocs(toQuery(db, spec, cursor.current))
      .then((snap) => {
        if (current.current !== key) return;
        cursor.current = snap.docs[snap.docs.length - 1] ?? cursor.current;
        const more = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RentalItem);
        setPage((prev) => (prev.key === key
          ? { ...prev, items: [...prev.items, ...more], hasMore: snap.docs.length === RENTAL_PAGE_SIZE }
          : prev));
      })
      .catch((e: Error) => {
        if (current.current === key) setPage((prev) => (prev.key === key ? { ...prev, hasMore: false, error: e.message } : prev));
      })
      .finally(() => setLoadingMore(false));
  }, [answered, hasMore, loadingMore, spec, specKey]);

  const error = answered ? page.error : null;
  const visible = useMemo(() => items.filter((i) => matchesLoaded(i, search, brands)), [items, search, brandsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return { items: visible, loading, loadingMore, hasMore, error, loadMore };
}
