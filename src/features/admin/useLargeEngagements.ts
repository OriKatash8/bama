import { useCallback, useEffect, useState } from 'react';
import { callFunction } from '@core/firebase/functions';

export type LargeFeeState = 'pending' | 'paid' | 'disputed' | 'not_owed' | 'exempt';

/** One professional on one project whose own amount is above the line. */
export type LargeEngagement = {
  projectId: string;
  professionalId: string;
  proName: string;
  title: string;
  projectStatus: string;
  chatId: string | null;
  baseAmount: number;
  fee: number;
  outstanding: number;
  feeState: LargeFeeState;
  active: boolean;
  hiredAt: number | null;
};

const listLarge = callFunction<Record<string, never>, { rows: LargeEngagement[]; above: number }>(
  'adminListLargeEngagements',
);

const markFeePaid = callFunction<{ projectId: string; professionalId: string }, { ok: boolean; paid: number }>(
  'markFeePaid',
);

/** Above this many shekels (the server's LARGE_ENGAGEMENT_ABOVE) until it answers. */
export const LARGE_ABOVE_DEFAULT = 5000;

/**
 * Engagements above ₪5,000 — big fees the admin follows. Fee records are
 * server-read only, so this goes through the admin callable, like the fees page.
 */
export function useLargeEngagements() {
  const [rows, setRows] = useState<LargeEngagement[]>([]);
  const [above, setAbove] = useState(LARGE_ABOVE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await listLarge({});
      setRows(res.rows);
      setAbove(res.above);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Records the fee as paid (the Fees page's own action), then reloads — a
   *  settled fee leaves the list. Throws if the server refuses. */
  const markPaid = useCallback(
    async (row: Pick<LargeEngagement, 'projectId' | 'professionalId'>) => {
      await markFeePaid({ projectId: row.projectId, professionalId: row.professionalId });
      await load();
    },
    [load],
  );

  return { rows, above, loading, failed, reload: load, markPaid };
}
