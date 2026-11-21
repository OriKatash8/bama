import { useCallback, useEffect, useState } from 'react';
import { callFunction } from '@core/firebase/functions';
import type { HeldReview } from './HeldReviewNote';

/** One contested engagement, as `adminListFlaggedProjects` returns it. */
export type AdminDispute = {
  projectId: string;
  proId: string;
  proName: string;
  clientName: string;
  title: string;
  chatId: string | null;
  /** 'didnt_happen' | 'fee_disputed' — the fee's own adminReview.reason. */
  reason: string;
  /** The professional's own words, if they gave any. */
  note: string;
  /** When the dispute was submitted (ms), or null for a record without a date. */
  submittedAt: number | null;
  baseAmount: number;
  /** What resolving as 'completed' with no corrected price leaves owing. */
  feeDueIfCompleted: number;
  /** The client's review a "didn't happen" dispute is holding back, if any. */
  heldReview: HeldReview | null;
};

type FlaggedRow = {
  projectId: string; title: string; clientName: string; chatId?: string | null;
  proId: string | null; proName: string; reason: string; note: string; flaggedAt: number | null;
  disputes?: {
    proId: string; proName: string; reason: string; baseAmount: number; feeDueIfCompleted: number;
    heldReview?: HeldReview | null;
  }[];
};

const listFlagged = callFunction<Record<string, never>, { rows: FlaggedRow[] }>('adminListFlaggedProjects');

/** Only rows carrying a live dispute (engagementStatus 'disputed'). Pure. */
export function disputesFrom(rows: FlaggedRow[] | undefined): AdminDispute[] {
  return (rows ?? []).flatMap((row) => (row.disputes ?? []).map((d) => ({
    projectId: row.projectId,
    proId: d.proId,
    proName: d.proName || row.proName,
    clientName: row.clientName,
    title: row.title,
    chatId: row.chatId ?? null,
    reason: d.reason || row.reason,
    note: row.note,
    submittedAt: row.flaggedAt,
    baseAmount: d.baseAmount,
    feeDueIfCompleted: d.feeDueIfCompleted,
    heldReview: d.heldReview ?? null,
  })));
}

/**
 * The open disputes, newest first (the server sorts). One-shot like the Fees
 * screen, because the source is an admin-only callable, not a listener.
 *
 * THREE states, never two: a failed load is 'error', not an empty list, because an
 * empty list reads as "no disputes" — the wrong conclusion that outlives a toast.
 * The same call feeds the Fees screen's "Needs review" tab, so both always agree.
 */
export function useAdminDisputes() {
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = useCallback(
    () => Promise.resolve().then(() => listFlagged({})).then(
      (res) => { setDisputes(disputesFrom(res?.rows)); setState('ok'); },
      (e: unknown) => { console.error('[admin/disputes] load failed:', e); setState('error'); },
    ),
    [],
  );

  useEffect(() => { void load(); }, [load]);

  return { disputes, state, reload: load };
}
