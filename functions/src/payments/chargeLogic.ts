import { contestWindowEndsAt, type FeeDoc } from '../lifecycle/helpers';

/**
 * The decisions of the charging machine, pure so the whole table is testable
 * without Firestore. charge.ts runs them inside transactions.
 */

export const STALE_CLAIM_MS = 30 * 60_000;

type TimestampLike = { toMillis?: () => number } | null | undefined;
const ms = (t: TimestampLike): number | undefined => {
  const v = typeof t?.toMillis === 'function' ? t.toMillis() : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

export type ClaimVerdict =
  | { ok: true; attempt: number; amount: number; idempotencyKey: string }
  | { ok: false; reason: string };

/**
 * May this fee be charged right now? Every clause is a refusal; claimFeeForCharge
 * re-asks this inside the transaction, which is what makes two racing sweeps safe.
 *
 *  - owed, completed, not contested, not under admin review
 *  - unsettled and a positive `feeDue` (NET of paidAmount, never base x rate again)
 *  - the contest window has closed (`chargeDueAt`); a retry also needs `nextChargeAt`
 *  - not already charging / succeeded / parked at needs_card / awaiting a human
 *  - attempts left
 */
export function evaluateClaim(
  fee: FeeDoc | undefined,
  projectId: string,
  proId: string,
  opts: { chargeMaxAttempts: number },
  now: number,
): ClaimVerdict {
  const no = (reason: string): ClaimVerdict => ({ ok: false, reason });
  if (!fee) return no('no-fee');
  if (fee.feeStatus !== 'owed') return no('not-owed');
  if (fee.engagementStatus !== 'completed') return no('not-completed');
  if (fee.adminReviewPending === true) return no('under-review');
  if (fee.feePaid === true || fee.status === 'paid' || fee.status === 'not_owed') return no('settled');
  if (fee.chargeReview) return no('needs-human');
  if (fee.chargeExhausted === true) return no('exhausted');

  const amount = fee.feeDue;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return no('nothing-due');

  const dueAt = ms(contestWindowEndsAt(fee));
  if (dueAt === undefined || now < dueAt) return no('window-open');

  const state = fee.chargeState ?? 'idle';
  if (state !== 'idle' && state !== 'failed') return no(`state-${state}`);
  if (state === 'failed') {
    const next = ms(fee.nextChargeAt);
    if (next === undefined || now < next) return no('retry-not-due');
  } else {
    const next = ms(fee.nextChargeAt);
    if (next !== undefined && now < next) return no('retry-not-due');
  }

  const attempts = fee.chargeAttempts ?? 0;
  if (attempts >= opts.chargeMaxAttempts) return no('attempts-spent');

  return {
    ok: true,
    attempt: attempts + 1,
    amount,
    idempotencyKey: `${projectId}_${proId}_${attempts + 1}`,
  };
}

/** Is a claim old enough that its worker is presumed dead? */
export function isClaimStale(fee: Pick<FeeDoc, 'chargeState' | 'chargeClaimedAt'>, now: number): boolean {
  if (fee.chargeState !== 'charging') return false;
  const at = ms(fee.chargeClaimedAt);
  return at === undefined || now - at >= STALE_CLAIM_MS;
}

/** Where a FAILED attempt leaves the fee. */
export type FailurePlan =
  | { kind: 'needs_card' }
  | { kind: 'retry'; nextChargeAt: number }
  | { kind: 'exhausted' };

export function planFailure(
  failureClass: 'final' | 'retryable' | undefined,
  attemptsSpent: number,
  opts: { chargeMaxAttempts: number; chargeRetryHours: number },
  now: number,
): FailurePlan {
  // An unclassified failure is treated as final: retrying a card we cannot read
  // the verdict on is how a stolen card gets hit repeatedly.
  if (failureClass !== 'retryable') return { kind: 'needs_card' };
  if (attemptsSpent >= opts.chargeMaxAttempts) return { kind: 'exhausted' };
  return { kind: 'retry', nextChargeAt: now + opts.chargeRetryHours * 3_600_000 };
}

/** Parse `${projectId}_${proId}_${attempt}`. Ids contain no underscores. */
export function parseIdempotencyKey(key: string): { projectId: string; proId: string; attempt: number } | null {
  const m = /^([^_]+)_([^_]+)_(\d+)$/.exec(key);
  return m ? { projectId: m[1], proId: m[2], attempt: Number(m[3]) } : null;
}
