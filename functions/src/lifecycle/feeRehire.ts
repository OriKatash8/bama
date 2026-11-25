import { FieldValue } from './helpers';

/**
 * What a previous engagement leaves on a professional's fee doc, and what a new
 * join of the same professional must clear.
 *
 * `hire.ts` writes the fee with `{ merge: true }`, so anything it does not name
 * survives. Re-hiring a rejected or withdrawn professional used to carry the old
 * engagement's `releaseReason` into the new one, which hid the live engagement
 * from the project roll-up (derive.ts) and stopped the project completing.
 *
 * A re-hire after a VOID engagement (`withdrawn` or `cancelled`) is a new join:
 * the fee is re-locked at the current rate and every field below is cleared.
 *
 * NOT cleared, deliberately — the record of real money and the manual refund path
 * (removal.ts keeps `paidAmount` for the same reason): `paidAmount`, `feePaid`
 * (dropped by the existing settled-fee branch), `feePaidAt`, `paidBy`,
 * `providerRef`, `paymentLink`, `linkReview`, `chargeReview`, `chargeNeedsAdmin`.
 * Identity (`professionalId`, `projectId`) and `createdAt` also stay.
 */

/** Engagement states that mean the previous engagement delivered nothing. */
const VOID_ENGAGEMENT = new Set(['withdrawn', 'cancelled']);

export function isVoidEngagement(status: unknown): boolean {
  return typeof status === 'string' && VOID_ENGAGEMENT.has(status);
}

/** Fields cleared on a new join after a void engagement. */
export const REHIRE_RESET_FIELDS = [
  // lifecycle
  'completion', 'chargeDueAt', 'disputeWindowEndsAt', 'completionDueAt', 'feeDue',
  // dispute and review
  'disputedAt', 'disputeReason', 'preDispute', 'adminReview', 'adminReviewPending',
  'agreedAmount', 'resolvedAt', 'resolvedOutcome', 'endRejected',
  // overdue and demand
  'overdueAt', 'dueNotifiedAt', 'overdueWarnedAt', 'overdueBlockNotifiedAt',
  'feeTimingVersion', 'reminders',
  'demandSentAt', 'endDatePromptedAt',
  // charge and link bookkeeping (not the money trail)
  'chargeState', 'chargeClaimId', 'chargeClaimedAt', 'chargeAttempts', 'nextChargeAt',
  'lastChargeError', 'chargeIdempotencyKey', 'chargeExhausted', 'noCardNotifiedAt',
  'paymentLinkClaim', 'linkNotifiedAt', 'needsPhoneNotifiedAt',
  'chargeAttemptCount', 'wouldFailCount', 'lastChargeAttempt',
] as const;

/**
 * The merge-write for a professional's fee doc on a hire. Pure but for FieldValue.
 *
 * First hire: locks the rate, the commission floor and the fee status. A re-hire
 * after a VOID engagement is the same, plus the resets above and a `baseAmount` SET
 * rather than accumulated. A second role for a professional whose engagement is
 * live or completed accumulates `baseAmount` and keeps everything else.
 */
export function buildHireFeeUpdate(args: {
  proId: string;
  projectId: string;
  amount: number;
  endDate?: unknown;
  existing: { exists: boolean; get: (field: string) => unknown };
  feeRate: number;
  minFeeApplied: number;
}): Record<string, unknown> {
  const { proId, projectId, amount, endDate, existing, feeRate, minFeeApplied } = args;
  // A re-hire after a VOID engagement (rejected / withdrawn / cancelled) is a new
  // join, not a second role: re-lock at the current rate and clear what the old
  // engagement left behind (feeRehire.ts), or it hides the live one from derive.
  const newJoin = !existing.exists || isVoidEngagement(existing.get('engagementStatus'));
  const feeUpdate: Record<string, unknown> = {
    professionalId: proId,
    projectId,
    baseAmount: existing.exists && newJoin ? amount : FieldValue.increment(amount),
    slotActive: true,
    // Never survives a hire: the previous engagement's release reason.
    releaseReason: FieldValue.delete(),
    // Set on EVERY hire, not just the first. Being hired is what makes an
    // engagement live, and once completion is per-engagement a professional whose
    // engagement already closed can be hired again onto the same still-open
    // project — that re-hire has to pull them back out of 'completed'. The
    // feePaid reset below is the money half of the same re-engagement.
    engagementStatus: 'hired',
    // Stamped from the project's endDate, or left absent when there is none —
    // which is every project that predates this field, and every project whose
    // client answered 'flexible'. Absent means this engagement never
    // auto-completes; it waits for the professional to mark it.
    ...(endDate ? { completionDueAt: endDate } : {}),
  };
  if (newJoin) {
    // Written once, at this pro's FIRST hire on this project, and immutable
    // afterwards. The RATE IS CAPTURED HERE, not at completion: a later edit to
    // config/pricing.feePercent must never change a fee that was already agreed.
    feeUpdate.feeStatus = 'owed';
    feeUpdate.feeRate = feeRate;
    // The commission FLOOR, locked here for the same reason as the rate: raising
    // config/pricing.minFeeAmount later must never reprice a project that was
    // already agreed. Absent on pre-floor records, which read it as 0.
    feeUpdate.minFeeApplied = minFeeApplied;
    feeUpdate.status = 'pending';
    feeUpdate.hiredAt = FieldValue.serverTimestamp();
    if (!existing.exists) {
      feeUpdate.createdAt = FieldValue.serverTimestamp();
    } else {
      // A new join after a void engagement: clear everything the old one left.
      for (const f of REHIRE_RESET_FIELDS) if (!(f in feeUpdate)) feeUpdate[f] = FieldValue.delete();
      if (existing.get('feePaid') === true) {
        feeUpdate.feePaid = false;
        feeUpdate.feePaidAt = FieldValue.delete();
      }
    }
  } else if (existing.get('feePaid') === true) {
    // Re-hire onto a project whose fee this pro has ALREADY settled, for a
    // further role. The extra baseAmount is genuinely owed, so the settled flag
    // has to drop — otherwise markFeePaid would refuse the new amount as
    // "already paid" and it could never be recorded.
    // `paidAmount` is untouched and carries their earlier payment forward, so
    // they are charged only the delta, never twice for the first portion.
    // Bookkeeping only: nothing here affects slots, reviews, or what they can do.
    feeUpdate.feePaid = false;
    feeUpdate.feePaidAt = FieldValue.delete();
    feeUpdate.status = 'pending';
    // A fresh debt cycle: the settled one's overdue clock and notices must not
    // carry over, or the next completion would inherit a deadline that already
    // passed and block on the spot.
    feeUpdate.overdueAt = FieldValue.delete();
    feeUpdate.dueNotifiedAt = FieldValue.delete();
    feeUpdate.overdueWarnedAt = FieldValue.delete();
    feeUpdate.feeTimingVersion = FieldValue.delete();
    feeUpdate.reminders = FieldValue.delete();
    feeUpdate.overdueBlockNotifiedAt = FieldValue.delete();
  }
  return feeUpdate;
}
