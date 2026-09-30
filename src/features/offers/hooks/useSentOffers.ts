import { useEffect, useMemo, useRef, useState } from 'react';
import { where } from 'firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { subscribeToCollection, getDocument } from '@core/firebase/firestore';
import type { PriceOffer, BundleOffer, ProjectRequest } from '@core/types/project';

export type SentOfferEntry =
  | { kind: 'price'; id: string; data: PriceOffer; projectTitle: string | null; ts: number }
  | { kind: 'bundle'; id: string; data: BundleOffer; projectTitle: string | null; ts: number };

/** createdAt may be a Firestore Timestamp OR the legacy manual {seconds} object. */
function secondsOf(ts?: { seconds?: number } | null): number {
  return ts?.seconds ?? 0;
}

/** The professional's own sent offers (individual + bundle), newest first, joined to project titles. */
export function useSentOffers() {
  const uid = useAuthStore((s) => s.user?.id);
  const [priceOffers, setPriceOffers] = useState<PriceOffer[]>([]);
  const [bundleOffers, setBundleOffers] = useState<BundleOffer[]>([]);
  const [titles, setTitles] = useState<Record<string, string | null>>({});
  /** Projects found deleted: cancelled (the client's "delete") or no longer there. */
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) { setPriceOffers([]); setBundleOffers([]); setLoading(false); return; }
    setLoading(true);
    const unsubP = subscribeToCollection<PriceOffer>(
      'priceOffers', (d) => { setPriceOffers(d); setLoading(false); }, where('professionalId', '==', uid),
    );
    const unsubB = subscribeToCollection<BundleOffer>(
      'bundleOffers', (d) => setBundleOffers(d), where('professionalId', '==', uid),
    );
    return () => { unsubP(); unsubB(); };
  }, [uid]);

  // Resolve project titles once each (projects may be missing/closed → null).
  useEffect(() => {
    const ids = new Set<string>();
    priceOffers.forEach((o) => ids.add(o.projectId));
    bundleOffers.forEach((o) => ids.add(o.projectId));
    ids.forEach((pid) => {
      if (fetchedRef.current.has(pid)) return;
      fetchedRef.current.add(pid);
      getDocument<ProjectRequest>(`projects/${pid}`)
        .then((p) => {
          setTitles((prev) => ({ ...prev, [pid]: p?.title ?? null }));
          setGone((prev) => ({ ...prev, [pid]: !p || p.status === 'cancelled' }));
        })
        .catch(() => setTitles((prev) => ({ ...prev, [pid]: null })));
    });
  }, [priceOffers, bundleOffers]);

  // A pending offer on a deleted project is gone — the server removes it; this
  // also hides any left from before that. Accepted and other decided offers stay
  // as history.
  const live = <T extends { status: string; projectId: string }>(o: T) => !(o.status === 'pending' && gone[o.projectId]);

  const offers = useMemo<SentOfferEntry[]>(() => {
    // Individual offers that belong to a bundle are represented by the bundle entry.
    const priceEntries: SentOfferEntry[] = priceOffers
      .filter((o) => !o.bundleId && live(o))
      .map((o) => ({ kind: 'price', id: o.id, data: o, projectTitle: titles[o.projectId] ?? null, ts: secondsOf(o.createdAt) }));
    const bundleEntries: SentOfferEntry[] = bundleOffers
      .filter(live)
      .map((o) => ({ kind: 'bundle', id: o.id, data: o, projectTitle: titles[o.projectId] ?? null, ts: secondsOf(o.createdAt) }));
    return [...priceEntries, ...bundleEntries].sort((a, b) => b.ts - a.ts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceOffers, bundleOffers, titles, gone]);

  const pendingCount = useMemo(
    () =>
      priceOffers.filter((o) => o.status === 'pending' && !o.bundleId && live(o)).length +
      bundleOffers.filter((o) => o.status === 'pending' && live(o)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [priceOffers, bundleOffers, gone],
  );

  return { offers, pendingCount, loading };
}
