import { createHash, timingSafeEqual } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, Timestamp, feeRef, type FeeDoc, type LinkReview } from '../lifecycle/helpers';
import { settleFee } from '../lifecycle/completion';
import { feeKeyOf, parseFeeKey } from './linkLogic';
import type { WebhookEvent } from './types';

type LinkPayment = Extract<WebhookEvent, { type: 'link_payment' }>;

/**
 * Compare the shared secret without leaking its length or a matching prefix:
 * both sides are hashed to a fixed width first, then compared in constant time.
 * An empty or missing expected secret never matches (an unset secret must not
 * turn the endpoint into an open door).
 */
export function verifyLinkSecret(provided: unknown, expected: string): boolean {
  if (!expected || typeof provided !== 'string' || !provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Make's body -> a LinkPayment, or null when it is not understood. Never throws. */
export function parseLinkPayment(body: unknown): LinkPayment | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
  const processId = str(b.paymentLinkProcessId);
  const transactionId = str(b.transactionId);
  const amount = b.amount;
  if (!processId || !transactionId) return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  if (b.status !== undefined && b.status !== 'paid') return null;   // Make forwards paid only
  // Absent, null or blank all mean "Grow did not return Custom Field 1" (Make maps a
  // missing field to ""). Anything else must be a string.
  if (b.feeKey !== null && b.feeKey !== undefined && typeof b.feeKey !== 'string') return null;
  const feeKey = typeof b.feeKey === 'string' && b.feeKey.trim() ? b.feeKey.trim() : null;
  return {
    type: 'link_payment',
    providerEventId: `link_${transactionId}`,
    processId, transactionId, amount, feeKey,
    ...(str(b.asmachta) ? { asmachta: str(b.asmachta)! } : {}),
  };
}

/** Whole-shekel fees; the epsilon only absorbs a float round trip through Make. */
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;

type Reason = LinkReview['reason'] | 'link_unmatched';

/** Money arrived that must not settle anything: put it where an admin will see it. */
async function flag(
  reason: Reason, ev: LinkPayment, now: number,
  where?: { projectId: string; proId: string },
): Promise<'needs_review'> {
  const at = Timestamp.fromMillis(now);
  const note = `link payment ${ev.transactionId} (asmachta ${ev.asmachta ?? '-'}) not applied`;
  if (where && reason !== 'link_unmatched') {
    // The fee may legitimately not exist any more; then it is an unmatched payment.
    const ref = feeRef(where.projectId, where.proId);
    if ((await ref.get()).exists) {
      await ref.update({
        linkReview: {
          reason, at, transactionId: ev.transactionId, processId: ev.processId, amount: ev.amount, note,
        } satisfies LinkReview,
        chargeNeedsAdmin: true,
        projectId: where.projectId,
      });
      return 'needs_review';
    }
  }
  await db.doc(`paymentLinkIssues/${encodeURIComponent(ev.transactionId).slice(0, 400)}`).set({
    reason: reason === 'link_unmatched' ? reason : 'link_unmatched',
    originalReason: reason,
    transactionId: ev.transactionId, processId: ev.processId, feeKey: ev.feeKey ?? null,
    amount: ev.amount, asmachta: ev.asmachta ?? null,
    ...(where ? { projectId: where.projectId, proId: where.proId } : {}),
    at, acknowledged: false, createdAt: FieldValue.serverTimestamp(),
  });
  return 'needs_review';
}

/**
 * The ONLY place a payment link settles a fee. Called from processWebhookEvent
 * (so idempotent per bank transaction) and written to be safe to re-run: if a
 * crash left the fee settled but the event not yet marked processed, the retry
 * recognises its own transaction and finishes.
 *
 * Match: paymentLinks/{processId} is primary (we wrote it when the link was
 * made). feeKey, when Make passes it, is a cross-check only; disagreement settles
 * nothing. Amount must equal what the link was created for.
 */
export async function applyLinkPayment(
  ev: LinkPayment, now: number,
): Promise<'settled' | 'needs_review'> {
  const ptrSnap = await db.doc(`paymentLinks/${ev.processId}`).get();
  if (!ptrSnap.exists) return flag('link_unmatched', ev, now);
  const ptr = ptrSnap.data() as {
    projectId: string; proId: string; feeKey: string; amount: number; supersededAt?: unknown;
  };
  const where = { projectId: ptr.projectId, proId: ptr.proId };

  if (ev.feeKey) {
    const parsed = parseFeeKey(ev.feeKey);
    if (!parsed || feeKeyOf(parsed.projectId, parsed.proId) !== ptr.feeKey) {
      return flag('link_key_mismatch', ev, now, where);
    }
  }

  const feeSnap = await feeRef(ptr.projectId, ptr.proId).get();
  if (!feeSnap.exists) return flag('link_unmatched', ev, now, where);
  const fee = feeSnap.data() as FeeDoc;

  // Our own earlier run of this very transaction.
  if (fee.paidBy === 'link' && fee.providerRef === ev.transactionId) {
    if (fee.chargeState !== 'succeeded') {
      await feeRef(ptr.projectId, ptr.proId).update({ chargeState: 'succeeded' });
    }
    return 'settled';
  }

  if (fee.feePaid === true || fee.status === 'paid') return flag('link_after_settled', ev, now, where);
  if (
    ptr.supersededAt || fee.paymentLink?.processId !== ev.processId || fee.paymentLink?.superseded === true
    || fee.status === 'not_owed' || fee.feeStatus !== 'owed'
    // A contested fee is in front of an admin: a payment must not settle it behind
    // their back. contestEngagement supersedes the live link in its own transaction;
    // this catches a payment that was already in flight.
    || fee.engagementStatus === 'disputed' || fee.adminReviewPending === true
  ) return flag('link_superseded', ev, now, where);
  if (!sameAmount(ev.amount, ptr.amount) || !sameAmount(ev.amount, fee.paymentLink.amount)) {
    return flag('link_amount_mismatch', ev, now, where);
  }

  try {
    await settleFee(ptr.projectId, ptr.proId, {
      source: 'link', providerRef: ev.transactionId, chargedAmount: ptr.amount,
    });
  } catch (err) {
    if (err instanceof HttpsError) {
      // The fee moved between our read and settleFee's transaction. Nothing was
      // recorded; a human decides about the money.
      if (err.message === 'amount-mismatch') return flag('link_amount_mismatch', ev, now, where);
      if (err.message === 'already-paid') return flag('link_after_settled', ev, now, where);
      if (err.message === 'nothing-owed') return flag('link_superseded', ev, now, where);
    }
    throw err;   // transient: 500, Make retries, the event is still unprocessed
  }
  await feeRef(ptr.projectId, ptr.proId).update({ chargeState: 'succeeded' });
  return 'settled';
}
