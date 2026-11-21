import { useCallback, useEffect, useState } from 'react';
import { callFunction } from '@core/firebase/functions';

/**
 * The client side of `adminUserActivity` (functions/src/moderation/userActivity.ts). The callable lives in
 * europe-west1, next to the database (eur3). Types mirror the server's response; the server is the source.
 */
export type ActivitySection = 'moderation' | 'projects' | 'fees' | 'disputes' | 'reviews' | 'communities';
export const SECTION_ORDER: ActivitySection[] = ['moderation', 'projects', 'fees', 'disputes', 'reviews', 'communities'];

export type Person = { uid: string; name: string };
export type HeldReview = { rating: number; text: string; authorName: string };

export type ModerationItem =
  | { kind: 'action'; id: string; at: number | null; action: string; reason: string; actorName: string; reportId: string | null }
  | {
    kind: 'report_received' | 'report_filed'; id: string; at: number | null; type: string | null; targetType: string | null;
    reason: string; snippet: string; status: string; other: Person | null;
  };
export type ProjectItem = {
  projectId: string; title: string; status: string; roles: ('client' | 'professional')[]; at: number | null;
  completedAt: number | null; chatId: string | null; others: Person[]; engagement: { status: string | null; amount: number } | null;
};
export type FeeItem = {
  projectId: string; title: string; at: number | null; engagementStatus: string | null; status: string | null; baseAmount: number;
  feeDue: number; paidAmount: number; feePaid: boolean; paidAt: number | null; paidBy: string | null; chargeState: string | null;
  chargeDueAt: number | null; overdueAt: number | null; providerRef: string | null;
  paymentLink: { processId: string; amount: number; createdAt: number | null; superseded: boolean } | null; review: string | null;
};
export type DisputeItem = {
  projectId: string; title: string; at: number | null; role: 'professional' | 'client'; pro: Person; state: 'open' | 'resolved';
  reason: string | null; note: string; outcome: string | null; resolvedAt: number | null; originalFee: number | null; heldReview: HeldReview | null;
};
export type ReviewItem = {
  id: string; at: number | null; direction: 'received' | 'given'; rating: number; text: string; published: boolean; held: boolean;
  projectId: string | null; other: Person | null;
};
export type CommunityItem = { id: string; name: string; role: 'owner' | 'member'; status: 'active' | 'suspended'; memberCount: number; at: number | null };

export type ItemOf = {
  moderation: ModerationItem; projects: ProjectItem; fees: FeeItem; disputes: DisputeItem; reviews: ReviewItem; communities: CommunityItem;
};
export type FeeSummary = { owed: number; open: number; paid: number; blockedFrom: number | null };
export type SectionPage<T> = { section: ActivitySection; items: T[]; nextCursor: string | null; total: number; truncated: boolean; summary?: FeeSummary };

export type ActivitySummary = {
  moderation: { actions: number; reportsReceived: number; reportsFiled: number };
  projects: { asClient: number; asProfessional: number };
  fees: { records: number; open: number; owed: number; blockedFrom: number | null };
  disputes: { open: number; resolved: number };
  reviews: { received: number; given: number; held: number };
  communities: { owned: number; member: number };
};

const call = callFunction<{ uid: string; section: string; cursor?: string }, unknown>('adminUserActivity', 'europe-west1');

/** One ⋮ / tab-bar summary: counts for every tab, from one cheap call. `null` while loading, `'error'` on failure. */
export function useActivitySummary(uid: string, enabled = true, refreshKey = 0): ActivitySummary | null | 'error' {
  const [state, setState] = useState<{ key: string; value: ActivitySummary | 'error' } | null>(null);
  const key = `${uid}:${refreshKey}`;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    (call({ uid, section: 'summary' }) as Promise<{ summary: ActivitySummary }>).then(
      (r) => { if (live) setState({ key, value: r.summary }); },
      (err: unknown) => { console.error('[admin/activity] summary failed:', err); if (live) setState({ key, value: 'error' }); },
    );
    return () => { live = false; };
  }, [uid, enabled, key]);
  return state?.key === key ? state.value : null;
}

export type SectionState<K extends ActivitySection> = {
  items: ItemOf[K][];
  status: 'loading' | 'ok' | 'error';
  moreStatus: 'idle' | 'loading' | 'error';
  nextCursor: string | null;
  truncated: boolean;
  total: number;
  summary?: FeeSummary;
  loadMore: () => void;
  retry: () => void;
};

/**
 * One section, paged. The parent gives the component a `key` (user + section + refresh counter), so a new
 * user or a refresh remounts it with clean state; no state is reset inside an effect.
 */
export function useActivitySection<K extends ActivitySection>(uid: string, section: K): SectionState<K> {
  const [items, setItems] = useState<ItemOf[K][]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [moreStatus, setMoreStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<FeeSummary | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    (call({ uid, section }) as Promise<SectionPage<ItemOf[K]>>).then(
      (r) => {
        if (!live) return;
        setItems(r.items); setNextCursor(r.nextCursor); setTruncated(r.truncated); setTotal(r.total); setSummary(r.summary); setStatus('ok');
      },
      (err: unknown) => { console.error(`[admin/activity] ${section} failed:`, err); if (live) setStatus('error'); },
    );
    return () => { live = false; };
  }, [uid, section, attempt]);

  const loadMore = useCallback(() => {
    if (!nextCursor || moreStatus === 'loading') return;
    setMoreStatus('loading');
    (call({ uid, section, cursor: nextCursor }) as Promise<SectionPage<ItemOf[K]>>).then(
      (r) => { setItems((prev) => [...prev, ...r.items]); setNextCursor(r.nextCursor); setMoreStatus('idle'); },
      (err: unknown) => { console.error(`[admin/activity] ${section} page failed:`, err); setMoreStatus('error'); },
    );
  }, [uid, section, nextCursor, moreStatus]);

  const retry = useCallback(() => { setStatus('loading'); setAttempt((n) => n + 1); }, []);
  return { items, status, moreStatus, nextCursor, truncated, total, summary, loadMore, retry };
}
