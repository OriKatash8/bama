import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, requireAuth, requireAdmin, feeRef, outstandingOf, type FeeDoc,
} from './helpers';
import { readConfig } from './config';
import { applyDerivedProjectState } from './derive';
import { overdueStampFields, recomputeFeeBlockSafely, sendFeeNotice } from './feeOverdue';
import { isOfferPriceValid } from '../pricing';

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

export type DisputeOutcome = 'completed' | 'cancelled';

/**
 * The fee a dispute resolved as 'completed' leaves owing. Pure.
 *
 *  - `agreedAmount` given: the admin settled on a corrected price. Priced exactly
 *    as completion prices — this pro's locked rate and locked floor, less anything
 *    paid early (outstandingOf).
 *  - otherwise the fee as it stood before the contest (`preDispute`), which is
 *    what `didnt_happen` zeroed;
 *  - otherwise (a contest made before preDispute existed) recomputed from the
 *    surviving baseAmount with the same function.
 */
export function resolvedFee(
  fee: FeeDoc, agreedAmount?: number,
): { baseAmount: number; feeDue: number } {
  if (fee.feeStatus !== 'owed') {
    return { baseAmount: agreedAmount ?? fee.baseAmount ?? 0, feeDue: 0 };
  }
  if (typeof agreedAmount === 'number') {
    return { baseAmount: agreedAmount, feeDue: outstandingOf(fee, agreedAmount) };
  }
  if (fee.preDispute) {
    const wasVoid = fee.preDispute.status === 'not_owed';
    return {
      baseAmount: fee.preDispute.baseAmount,
      feeDue: wasVoid ? 0 : Math.max(0, fee.preDispute.feeDue),
    };
  }
  const baseAmount = fee.baseAmount ?? 0;
  return { baseAmount, feeDue: outstandingOf(fee, baseAmount) };
}

/**
 * Admin: close a contested engagement.
 *
 *  'completed' — the work happened. The fee is restored (or repriced at
 *    `agreedAmount`) and the overdue clock RESTARTS from now: the time spent in
 *    dispute does not count against the professional.
 *  'cancelled' — nothing is owed. The fee is voided.
 *
 * Either way the engagement leaves 'disputed', the slot the contest re-took is
 * released, and the project's review flag re-derives. Closes the gap documented in
 * __tests__/contestResolution.test.ts: settling the fee was never a resolution.
 */
export const resolveFeeDispute = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);
  const projectId = request.data?.projectId as string | undefined;
  const proId = request.data?.proId as string | undefined;
  const outcome = request.data?.outcome as DisputeOutcome | undefined;
  const rawAmount = request.data?.agreedAmount as unknown;
  if (!projectId || !proId) throw new HttpsError('invalid-argument', 'projectId and proId required');
  if (outcome !== 'completed' && outcome !== 'cancelled') {
    throw new HttpsError('invalid-argument', 'outcome must be completed or cancelled');
  }
  let agreedAmount: number | undefined;
  if (rawAmount !== undefined && rawAmount !== null) {
    if (outcome !== 'completed') throw new HttpsError('invalid-argument', 'agreedAmount only with completed');
    if (!isOfferPriceValid(rawAmount)) throw new HttpsError('invalid-argument', 'agreed-amount-out-of-range');
    agreedAmount = rawAmount;
  }

  const config = await readConfig();
  const now = Date.now();
  const ref = feeRef(projectId, proId);

  const { feeDue, notifyDue } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'no-engagement');
    const fee = snap.data() as FeeDoc;
    if (fee.engagementStatus !== 'disputed') {
      throw new HttpsError('failed-precondition', 'not-disputed');
    }

    const common: Update = {
      adminReviewPending: false,
      adminReview: FieldValue.delete(),
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedOutcome: outcome,
      slotActive: false,
      overdueWarnedAt: FieldValue.delete(),
      overdueBlockNotifiedAt: FieldValue.delete(),
    };

    if (outcome === 'cancelled') {
      tx.update(ref, {
        ...common,
        engagementStatus: 'cancelled',
        feeDue: 0,
        status: 'not_owed',
        overdueAt: FieldValue.delete(),
        dueNotifiedAt: FieldValue.delete(),
      } as Update);
      return { feeDue: 0, notifyDue: false };
    }

    const priced = resolvedFee(fee, agreedAmount);
    const owed = fee.feeStatus === 'owed';
    // The clock restarts from the resolution. With the switch off nothing is
    // stamped — and a stale overdueAt from before the dispute is removed, so
    // turning the switch on later cannot resurrect it.
    const stamp = priced.feeDue > 0 ? overdueStampFields(config, now) : {};
    const stamped = 'overdueAt' in stamp;
    tx.update(ref, {
      ...common,
      engagementStatus: 'completed',
      baseAmount: priced.baseAmount,
      feeDue: priced.feeDue,
      feePaid: priced.feeDue <= 0,
      status: owed ? (priced.feeDue > 0 ? 'pending' : 'paid') : 'not_owed',
      ...(agreedAmount !== undefined ? { agreedAmount } : {}),
      ...(stamped ? stamp : { overdueAt: FieldValue.delete() }),
      // The contest window is long closed, so the cron's chargeDueAt-keyed due
      // notice would never find this fee; the notice is sent below instead.
      dueNotifiedAt: stamped ? FieldValue.serverTimestamp() : FieldValue.delete(),
    } as Update);
    return { feeDue: priced.feeDue, notifyDue: stamped };
  });

  // The contest re-took the slot (contestEngagement); a closed engagement holds none.
  await db.doc(`projects/${projectId}`).update({
    slotHolders: FieldValue.arrayRemove(proId),
  } as Update);
  await applyDerivedProjectState(projectId);
  await recomputeFeeBlockSafely(proId);
  if (notifyDue) {
    // After the commit; a failed push must not report a recorded resolution as failed.
    await sendFeeNotice('fee_due', proId, projectId, feeDue)
      .catch((err) => console.error('[resolveFeeDispute] fee_due notice failed', err));
  }

  return { ok: true, outcome, feeDue };
});
