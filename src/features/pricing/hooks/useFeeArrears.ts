import { useEffect, useState } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { listenToMyFees } from '../services/feesService';
import { outstandingFee } from '../utils/fee';
import { earliestOverdueAt, feeIsOverdue } from '../utils/overdue';
import { usePricingConfig } from './usePricingConfig';
import type { ProjectFee } from '@core/types/project';

export type FeeArrears = {
  /** True when at least one fee is past its grace period — the same condition
   *  `hireProfessional` refuses on. */
  blocked: boolean;
  /** Everything still outstanding, across every project. */
  totalOwed: number;
  /** The oldest payment demand, in ms. `null` when none has been sent. */
  oldestDemandSentAt: number | null;
  graceDays: number;
  /** True when an unpaid fee is past its overdue time (completion +
   *  feeOverdueBlockDays) and the kill switch is on — the condition the hire gate
   *  and the offer rule refuse on. */
  overdueBlocked: boolean;
  /** What is owed on the overdue fees alone — the banner's amount. */
  overdueTotal: number;
  /** The earliest moment any fee starts blocking, in ms (may be in the future).
   *  `null` when none will. Mirrors feeBlocks/{uid}.blockedFrom. */
  overdueFrom: number | null;
};

const EMPTY: FeeArrears = {
  blocked: false, totalOwed: 0, oldestDemandSentAt: null, graceDays: 0,
  overdueBlocked: false, overdueTotal: 0, overdueFrom: null,
};

/**
 * Whether this professional is in arrears, and by how much.
 *
 * A MIRROR OF THE SERVER, NOT THE AUTHORITY. `hireProfessional` enforces with
 * `feeBlocksNewHire`; this exists so a blocked professional is told BEFORE they
 * compose an offer rather than after the client's accept is rejected — the same
 * job `listenToSlotUsage` does for the open-project cap.
 *
 * It deliberately fails OPEN. A rules error or a missing config resolves to "not
 * blocked", so the worst case is that the explainer does not appear and the
 * server refuses the hire — never that a professional with a clean account is
 * shown an arrears notice they cannot act on.
 *
 * The predicate is kept in step with the server clause by clause; the one
 * asymmetry is that the client cannot see fees belonging to anyone else, which
 * does not matter because arrears are per-professional.
 */
export function useFeeArrears(): FeeArrears {
  const userId = useAuthStore((s) => s.user?.id);
  const { paymentFailureGraceDays, feeOverdueBlockEnabled } = usePricingConfig();
  const [fees, setFees] = useState<Map<string, ProjectFee> | null>(null);
  // Bumped when a future block time arrives, so the banner appears on the second
  // the server starts refusing, not on the next unrelated re-render.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!userId) { setFees(null); return; }
    return listenToMyFees(userId, setFees);
  }, [userId]);

  const overdueFrom = feeOverdueBlockEnabled && fees ? earliestOverdueAt(fees.values()) : null;
  useEffect(() => {
    if (overdueFrom === null) return;
    const wait = overdueFrom - Date.now();
    // setTimeout overflows past ~24.8 days; a block that far out is re-armed by
    // the next fee snapshot or remount long before it arrives.
    if (wait <= 0 || wait > 2_000_000_000) return;
    const id = setTimeout(() => setTick((n) => n + 1), wait + 50);
    return () => clearTimeout(id);
  }, [overdueFrom]);

  if (!fees) return { ...EMPTY, graceDays: paymentFailureGraceDays };

  const now = Date.now();
  let overdueTotal = 0;
  if (feeOverdueBlockEnabled) {
    for (const fee of fees.values()) {
      if (feeIsOverdue(fee, now)) overdueTotal += outstandingFee(fee);
    }
  }
  const overdueBlocked = overdueFrom !== null && now >= overdueFrom;

  let totalOwed = 0;
  let oldestDemandSentAt: number | null = null;
  let blocked = false;

  for (const fee of fees.values()) {
    totalOwed += outstandingFee(fee);

    // Mirrors feeBlocksNewHire in functions/src/pricing.ts, clause for clause.
    if (fee.feeStatus !== 'owed') continue;
    if (fee.feePaid === true) continue;
    if (fee.status === 'paid' || fee.status === 'not_owed' || fee.status === 'disputed') continue;

    const sentAt = fee.demandSentAt?.seconds ? fee.demandSentAt.seconds * 1000 : null;
    if (sentAt === null) continue; // never invoiced — the clock has not started

    if (oldestDemandSentAt === null || sentAt < oldestDemandSentAt) oldestDemandSentAt = sentAt;
    if (paymentFailureGraceDays > 0
      && Date.now() - sentAt > paymentFailureGraceDays * 86400_000) {
      blocked = true;
    }
  }

  return {
    blocked, totalOwed, oldestDemandSentAt, graceDays: paymentFailureGraceDays,
    overdueBlocked, overdueTotal, overdueFrom,
  };
}
