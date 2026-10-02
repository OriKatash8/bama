import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { where } from 'firebase/firestore';
import { subscribeToCollection, getDocument, setDocument } from '@core/firebase/firestore';
import { serverTimestamp } from 'firebase/firestore';
import type { ProjectRequest } from '@core/types/project';

type Secondsish = { seconds?: number } | null | undefined;

/** A cancelled project doc (cancelledAt is written by cancelProject but not typed). */
type CancelledProject = ProjectRequest & { cancelledAt?: Secondsish };

/** A purchase-cancellation audit doc (cancellations/{id}). */
type PurchaseCancellation = {
  id: string;
  type: 'purchase';
  productName?: string;
  actorName?: string;
  createdAt?: Secondsish;
};

export type CancellationEntry = {
  id: string;
  kind: 'project' | 'purchase';
  title: string;
  actorName: string | null;
  ts: number;
  /** A cancelled project's id and chat, so the admin can open the conversation. */
  projectId?: string;
  chatId?: string | null;
};

/** createdAt/cancelledAt may be a Firestore Timestamp or a legacy manual object. */
function secondsOf(ts: Secondsish): number {
  return ts?.seconds ?? 0;
}

/**
 * Admin cancellation log: cancelled projects (read live from `projects`, full
 * history) + cancelled purchases (from the `cancellations` audit collection,
 * written forward on cancel). Merged newest-first, capped at 20, without the
 * entries the admin removed (cancellationLogHidden).
 */
export function useCancellationLog() {
  const [projects, setProjects] = useState<CancelledProject[]>([]);
  const [purchases, setPurchases] = useState<PurchaseCancellation[]>([]);
  const [names, setNames] = useState<Record<string, string | null>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubP = subscribeToCollection<CancelledProject>(
      'projects', (d) => { setProjects(d); setLoading(false); }, where('status', '==', 'cancelled'),
    );
    const unsubC = subscribeToCollection<PurchaseCancellation>(
      'cancellations', (d) => setPurchases(d), where('type', '==', 'purchase'),
    );
    // Entries the admin removed from the list (the sources stay untouched).
    const unsubH = subscribeToCollection<{ id: string }>(
      'cancellationLogHidden', (d) => setHidden(new Set(d.map((h) => h.id))),
    );
    return () => { unsubP(); unsubC(); unsubH(); };
  }, []);

  // Resolve each cancelled project's client id → display name (once each).
  useEffect(() => {
    projects.forEach((p) => {
      const id = p.clientId;
      if (!id || fetchedRef.current.has(id)) return;
      fetchedRef.current.add(id);
      getDocument<{ displayName?: string }>(`users/${id}`)
        .then((u) => setNames((prev) => ({ ...prev, [id]: u?.displayName ?? null })))
        .catch(() => setNames((prev) => ({ ...prev, [id]: null })));
    });
  }, [projects]);

  const entries = useMemo<CancellationEntry[]>(() => {
    const proj: CancellationEntry[] = projects.map((p) => ({
      id: `proj-${p.id}`,
      kind: 'project',
      title: p.title ?? '',
      actorName: names[p.clientId] ?? null,
      ts: secondsOf(p.cancelledAt),
      projectId: p.id,
      chatId: p.chatId ?? null,
    }));
    const purch: CancellationEntry[] = purchases.map((c) => ({
      id: `pur-${c.id}`,
      kind: 'purchase',
      title: c.productName ?? '',
      actorName: c.actorName ?? null,
      ts: secondsOf(c.createdAt),
    }));
    return [...proj, ...purch].filter((e) => !hidden.has(e.id)).sort((a, b) => b.ts - a.ts).slice(0, 20);
  }, [projects, purchases, names, hidden]);

  /** Removes an entry from the list: an admin-only mark, nothing is deleted. */
  const hide = useCallback(async (entryId: string) => {
    await setDocument(`cancellationLogHidden/${entryId}`, { hiddenAt: serverTimestamp() });
  }, []);

  return { entries, loading, hide };
}
