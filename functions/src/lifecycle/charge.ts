import { db, computeFee, type FeeDoc } from './helpers';
import * as admin from 'firebase-admin';

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * THE CHARGE SEAM. Charges nothing today, on purpose.
 *
 * The schedule is real — engagements complete, a window opens, this is called
 * when it closes — but no money moves and no payment code ships in the app
 * binary. Cardcom slots in behind this one function; nothing else changes when
 * it does.
 *
 * IT RECORDS WHAT IT WOULD HAVE DONE, INCLUDING THE FAILURES. That is the whole
 * value of running the schedule before the integration exists: on the day
 * charging goes live, the population that matters most is the professionals whose
 * charge would have failed — no card, no token, an expired one — and if the stub
 * logged only the amounts it would have taken, that population would be invisible
 * until it became an incident. So every attempt writes both the intent and the
 * obstacle.
 *
 * Nothing here decides anything. It writes a record and returns; the caller owns
 * the state.
 */

export type ChargeAttempt = {
  at: admin.firestore.Timestamp;
  /** What would have been taken, in whole shekels. */
  amount: number;
  /** The inputs it was computed from, so a later reconciliation can re-derive it
   *  without trusting the number alone. */
  baseAmount: number;
  feeRate: number;
  minFeeApplied: number;
  /** Always false while this is a stub. */
  charged: false;
  /** Why not. `not_implemented` is the seam itself; the others are the obstacles
   *  that would have stopped a real charge even once it exists. */
  outcome: 'not_implemented' | 'would_fail_no_card' | 'nothing_owed';
  note?: string;
};

/**
 * Would this professional's charge have failed for want of a payment method?
 *
 * There is no card store yet, so today this is always true and says so plainly
 * rather than pretending to check. It exists as a named seam so the question is
 * asked from the start and the answer becomes real without the caller changing.
 */
function wouldFailForNoCard(): boolean {
  return true;
}

export async function chargeEngagementFee(
  projectId: string,
  proId: string,
): Promise<ChargeAttempt> {
  const ref = db.doc(`projects/${projectId}/fees/${proId}`);
  const fee = (await ref.get()).data() as FeeDoc | undefined;

  const now = admin.firestore.Timestamp.now();
  const base = { at: now, charged: false as const };

  if (!fee || fee.feeStatus !== 'owed') {
    const attempt: ChargeAttempt = {
      ...base, amount: 0, baseAmount: 0, feeRate: 0, minFeeApplied: 0,
      outcome: 'nothing_owed', note: fee ? `feeStatus=${fee.feeStatus}` : 'no fee record',
    };
    await ref.set({ lastChargeAttempt: attempt }, { merge: true });
    return attempt;
  }

  const amount = typeof fee.feeDue === 'number'
    ? Math.max(0, fee.feeDue)
    : computeFee(fee.baseAmount ?? 0, fee.feeRate, fee.minFeeApplied ?? 0) - (fee.paidAmount ?? 0);

  const attempt: ChargeAttempt = {
    ...base,
    amount: Math.max(0, amount),
    baseAmount: fee.baseAmount ?? 0,
    feeRate: fee.feeRate ?? 0,
    minFeeApplied: fee.minFeeApplied ?? 0,
    outcome: amount <= 0
      ? 'nothing_owed'
      // Both facts are recorded, not one: the seam is not built AND this
      // professional has no way to be charged. When the seam closes, the second
      // is the one still standing.
      : wouldFailForNoCard() ? 'would_fail_no_card' : 'not_implemented',
    note: 'stub — no payment integration; recorded for reconciliation',
  };

  // Appended as `lastChargeAttempt` plus a growing count, so a professional who
  // would have failed repeatedly is visible as a pattern rather than a single
  // most-recent row.
  await ref.set({
    lastChargeAttempt: attempt,
    chargeAttemptCount: admin.firestore.FieldValue.increment(1),
    ...(attempt.outcome === 'would_fail_no_card'
      ? { wouldFailCount: admin.firestore.FieldValue.increment(1) }
      : {}),
  } as Update, { merge: true });

  return attempt;
}
