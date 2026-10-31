import { randomUUID } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, Timestamp, feeRef, type FeeDoc,
} from '../lifecycle/helpers';
import { settleFee } from '../lifecycle/completion';
import { recomputeFeeBlockSafely } from '../lifecycle/feeOverdue';
import {
  evaluateClaim, planFailure, isClaimStale, parseIdempotencyKey, type ClaimVerdict,
} from './chargeLogic';
import { getProvider } from './getProvider';
import { sendChargeNotice } from './notices';
import { paymentMethodRef } from './paymentMethods';
import type { PaymentsConfig } from './guard';
import type { ChargeResult } from './types';

/**
 * The charging machine: claim -> charge -> record. Provider-agnostic; the only
 * gateway-specific call is provider.chargeToken.
 *
 * ONE writer discipline: every state change goes through a transaction that
 * re-reads the fee, so a cron sweep, a retry and a webhook racing each other
 * cannot double-claim or move a settled fee backwards. 'succeeded' is terminal.
 *
 * Payment never gates the app: nothing here touches slots, reviews or access.
 */

type Opts = Pick<PaymentsConfig, 'chargeMaxAttempts' | 'chargeRetryHours'>;

const attemptRef = (projectId: string, proId: string, key: string) =>
  db.doc(`projects/${projectId}/fees/${proId}/charges/${key}`);

export type ClaimResult =
  | { claimed: true; claimId: string; attempt: number; amount: number; idempotencyKey: string }
  | { claimed: false; reason: string };

/**
 * Transactionally claim a fee for ONE charge attempt. Replaces the old
 * `chargeAttemptCount` read-then-skip, which two overlapping runs could both pass.
 * The amount is `feeDue` as read INSIDE the transaction and is recorded on the
 * attempt, so what is charged and what is later settled are the same number.
 */
export async function claimFeeForCharge(
  projectId: string, proId: string, opts: Opts, now: number = Date.now(),
): Promise<ClaimResult> {
  const ref = feeRef(projectId, proId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const verdict: ClaimVerdict = evaluateClaim(
      snap.exists ? (snap.data() as FeeDoc) : undefined, projectId, proId, opts, now,
    );
    if (!verdict.ok) return { claimed: false as const, reason: verdict.reason };

    const claimId = randomUUID();
    tx.update(ref, {
      chargeState: 'charging',
      chargeClaimId: claimId,
      chargeClaimedAt: Timestamp.fromMillis(now),
      chargeIdempotencyKey: verdict.idempotencyKey,
      chargeAttempts: verdict.attempt,
      nextChargeAt: null,
      projectId,
    });
    tx.set(attemptRef(projectId, proId, verdict.idempotencyKey), {
      idempotencyKey: verdict.idempotencyKey,
      attempt: verdict.attempt,
      amount: verdict.amount,
      claimId,
      outcome: 'claimed',
      createdAt: FieldValue.serverTimestamp(),
    });
    return {
      claimed: true as const, claimId, attempt: verdict.attempt,
      amount: verdict.amount, idempotencyKey: verdict.idempotencyKey,
    };
  });
}

export type RunOutcome =
  | { status: 'no-provider' }
  | { status: 'skipped'; reason: string }
  | { status: 'needs_card' }
  | { status: 'unknown' }
  | { status: ChargeResult['outcome'] };

/**
 * Try to charge one fee. `no-provider` tells the caller to fall back to today's
 * stub; nothing is written in that case.
 */
export async function runCharge(
  projectId: string, proId: string, config: PaymentsConfig, now: number = Date.now(),
): Promise<RunOutcome> {
  const provider = getProvider(config, { professionalId: proId });
  if (!provider) return { status: 'no-provider' };

  // Cheap pre-flight outside the transaction, so a fee that cannot be charged yet
  // costs no write and a missing card does not burn an attempt.
  const fee = (await feeRef(projectId, proId).get()).data() as FeeDoc | undefined;
  const pre = evaluateClaim(fee, projectId, proId, config, now);
  if (!pre.ok) return { status: 'skipped', reason: pre.reason };

  const cardSnap = await paymentMethodRef(proId).get();
  const card = cardSnap.exists ? cardSnap.data() : undefined;
  if (!card || card.status !== 'active' || typeof card.token !== 'string') {
    await markNeedsCard(projectId, proId, pre.amount);
    return { status: 'needs_card' };
  }

  const claim = await claimFeeForCharge(projectId, proId, config, now);
  if (!claim.claimed) return { status: 'skipped', reason: claim.reason };

  let result: ChargeResult;
  try {
    result = await provider.chargeToken({
      token: card.token,
      amount: claim.amount,
      currency: 'ILS',
      idempotencyKey: claim.idempotencyKey,
      description: 'BAMA brokerage fee / עמלת תיווך',
      proId,
      projectId,
    });
  } catch (err) {
    // The request may or may not have reached the gateway. Releasing the claim
    // here could lead to a second charge, so it is LEFT at 'charging': the stale
    // sweep asks the provider what happened to this key and resolves it.
    console.error('[charge] provider call threw; leaving claim for reconciliation', projectId, proId, err);
    return { status: 'unknown' };
  }

  await applyChargeResult(projectId, proId, claim.idempotencyKey, result, config, now);
  return { status: result.outcome };
}

/** No usable card at due time: park the fee at needs_card (once) and tell the pro. */
async function markNeedsCard(projectId: string, proId: string, amount: number): Promise<void> {
  const ref = feeRef(projectId, proId);
  const notify = await db.runTransaction(async (tx) => {
    const fee = (await tx.get(ref)).data() as FeeDoc | undefined;
    const state = fee?.chargeState ?? 'idle';
    // Only an unclaimed fee may be parked; a claim in flight or a success is not ours to touch.
    if (!fee || (state !== 'idle' && state !== 'failed')) return false;
    const first = !fee.noCardNotifiedAt;
    tx.update(ref, {
      chargeState: 'needs_card',
      lastChargeError: { code: 'no_card', class: 'no_card', at: Timestamp.now() },
      ...(first ? { noCardNotifiedAt: FieldValue.serverTimestamp() } : {}),
    });
    return first;
  });
  if (notify) await sendChargeNotice('charge_no_card', proId, projectId, amount);
}

type After =
  | { notice: 'charge_retry' | 'charge_needs_card' | 'charge_exhausted'; amount: number; invalidateCard?: boolean }
  | { settled: true }
  | null;

/**
 * Record a gateway verdict on the fee. Shared by the cron (synchronous result),
 * the stale-claim reconciler and the webhook, so there is one set of rules:
 *
 *  - succeeded: always wins, even over a failure recorded earlier (the money was
 *    taken). Settles through the single settlement path.
 *  - failed: applies only to the attempt currently holding the claim; a late or
 *    replayed failure for anything else is ignored.
 *  - pending: changes nothing but the attempt log; the claim stays held.
 */
export async function applyChargeResult(
  projectId: string, proId: string, idempotencyKey: string,
  result: ChargeResult, opts: Opts, now: number = Date.now(),
): Promise<void> {
  const aRef = attemptRef(projectId, proId, idempotencyKey);
  const attemptSnap = await aRef.get();
  if (!attemptSnap.exists) {
    console.warn('[charge] result for unknown attempt', idempotencyKey);
    return;
  }

  if (result.outcome === 'pending') {
    await aRef.update({ outcome: 'pending', ...(result.providerRef ? { providerRef: result.providerRef } : {}) });
    return;
  }

  const chargedAmount = attemptSnap.get('amount') as number;
  await aRef.update({
    outcome: result.outcome,
    resolvedAt: FieldValue.serverTimestamp(),
    ...(result.providerRef ? { providerRef: result.providerRef } : {}),
    ...(result.failureCode ? { failureCode: result.failureCode } : {}),
    ...(result.failureClass ? { failureClass: result.failureClass } : {}),
  });

  if (result.outcome === 'succeeded') {
    await recordSuccess(projectId, proId, idempotencyKey, chargedAmount, result.providerRef);
    return;
  }

  const ref = feeRef(projectId, proId);
  const after: After = await db.runTransaction(async (tx) => {
    const fee = (await tx.get(ref)).data() as FeeDoc | undefined;
    if (!fee) return null;
    if (fee.chargeState === 'succeeded' || fee.feePaid === true) return null;          // terminal
    if (fee.chargeState !== 'charging' || fee.chargeIdempotencyKey !== idempotencyKey) return null; // stale

    const plan = planFailure(result.failureClass, fee.chargeAttempts ?? 1, opts, now);
    const error = {
      code: result.failureCode ?? 'unknown',
      class: result.failureClass ?? 'final',
      at: Timestamp.fromMillis(now),
    };
    const release = { chargeClaimId: null, chargeClaimedAt: null, lastChargeError: error };
    const amount = Math.max(0, fee.feeDue ?? chargedAmount);

    if (plan.kind === 'needs_card') {
      tx.update(ref, { ...release, chargeState: 'needs_card', nextChargeAt: null });
      return { notice: 'charge_needs_card' as const, amount, invalidateCard: true };
    }
    if (plan.kind === 'exhausted') {
      tx.update(ref, {
        ...release, chargeState: 'failed', nextChargeAt: null, chargeExhausted: true, chargeNeedsAdmin: true,
        chargeReview: { reason: 'attempts_exhausted', at: Timestamp.fromMillis(now), chargedAmount: 0, feeDueAtReview: fee.feeDue ?? 0 },
      });
      return { notice: 'charge_exhausted' as const, amount };
    }
    tx.update(ref, { ...release, chargeState: 'failed', nextChargeAt: Timestamp.fromMillis(plan.nextChargeAt) });
    return { notice: 'charge_retry' as const, amount };
  });

  if (!after || !('notice' in after)) return;
  if (after.invalidateCard) {
    await paymentMethodRef(proId).set(
      { status: 'invalid', invalidReason: result.failureCode ?? 'unknown', updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  await sendChargeNotice(after.notice, proId, projectId, after.amount);
}

/**
 * The gateway took the money. Record it through settleFee; if the books no longer
 * agree with the charge (re-hire changed feeDue, an admin settled first, a second
 * attempt also succeeded), do NOT record it against the wrong balance: mark the
 * fee for a human with the exact amounts.
 */
async function recordSuccess(
  projectId: string, proId: string, idempotencyKey: string, chargedAmount: number, providerRef?: string,
): Promise<void> {
  const ref = feeRef(projectId, proId);
  const prior = (await ref.get()).data() as FeeDoc | undefined;
  if (prior?.chargeState === 'succeeded' && prior.chargeIdempotencyKey === idempotencyKey) return; // replay

  // A crash between settling and the state write below leaves a fee that is
  // already paid BY THIS CHARGE but still reads 'charging'. Finish that write
  // instead of calling the replay a mismatch.
  const alreadyRecordedByThisCharge = prior?.feePaid === true && prior.paidBy === 'charge'
    && (!providerRef || prior.providerRef === providerRef);

  try {
    if (!alreadyRecordedByThisCharge) {
      await settleFee(projectId, proId, { source: 'charge', providerRef, chargedAmount });
    }
  } catch (err) {
    if (!(err instanceof HttpsError)) throw err;     // a transient error: let the caller retry
    await ref.update({
      chargeState: 'succeeded',
      chargeClaimId: null, chargeClaimedAt: null, nextChargeAt: null,
      chargeNeedsAdmin: true,
      ...(providerRef ? { providerRef } : {}),
      chargeReview: {
        reason: 'settle_mismatch',
        at: Timestamp.now(),
        chargedAmount,
        feeDueAtReview: prior?.feeDue ?? 0,
        ...(providerRef ? { providerRef } : {}),
        note: err.message,
      },
    });
    return;
  }

  await ref.update({
    chargeState: 'succeeded',
    chargeIdempotencyKey: idempotencyKey,
    chargeClaimId: null, chargeClaimedAt: null, nextChargeAt: null, lastChargeError: null,
    chargeExhausted: FieldValue.delete(),
  });
  await recomputeFeeBlockSafely(proId);
}

/**
 * A claim left at 'charging' past STALE_CLAIM_MS (worker died, provider call
 * threw). Ask the provider what happened to THAT key; never charge again blind.
 */
export async function reconcileStaleClaim(
  projectId: string, proId: string, config: PaymentsConfig, now: number = Date.now(),
): Promise<'resolved' | 'pending' | 'released' | 'flagged' | 'skipped'> {
  const ref = feeRef(projectId, proId);
  const fee = (await ref.get()).data() as FeeDoc | undefined;
  if (!fee || !isClaimStale(fee, now) || !fee.chargeIdempotencyKey) return 'skipped';
  const key = fee.chargeIdempotencyKey;

  const provider = getProvider(config, { professionalId: proId });
  const found = provider?.lookupCharge ? await provider.lookupCharge(key) : undefined;

  if (found === undefined) {
    // No way to ask: a human has to decide. Keep the claim so nothing recharges.
    await ref.update({
      chargeNeedsAdmin: true,
      chargeReview: { reason: 'unresolved_claim', at: Timestamp.fromMillis(now), feeDueAtReview: fee.feeDue ?? 0 },
    });
    return 'flagged';
  }
  if (found === null) {
    // The gateway never saw this key, so nothing was charged: let the next sweep try.
    const released = await db.runTransaction(async (tx) => {
      const cur = (await tx.get(ref)).data() as FeeDoc | undefined;
      if (!cur || cur.chargeState !== 'charging' || cur.chargeIdempotencyKey !== key) return false;
      tx.update(ref, {
        chargeState: 'failed', chargeClaimId: null, chargeClaimedAt: null, nextChargeAt: Timestamp.fromMillis(now),
        lastChargeError: { code: 'claim_released', class: 'retryable', at: Timestamp.fromMillis(now) },
      });
      return true;
    });
    return released ? 'released' : 'skipped';
  }
  if (found.outcome === 'pending') return 'pending';
  await applyChargeResult(projectId, proId, key, found, config, now);
  return 'resolved';
}

export { parseIdempotencyKey };
