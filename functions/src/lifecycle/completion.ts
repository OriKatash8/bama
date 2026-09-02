import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, requireAuth, requireAdmin, notify,
  feeRef, feesCol, computeProAmount, computeFee, publishProReview, type FeeDoc,
} from './helpers';
import { PAYMENTS_ENABLED } from '../pricing';

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

async function loadProject(projectId: string) {
  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  return { snap, project: snap.data() as Record<string, unknown> };
}

/**
 * What a pro still owes: their fee on their own amount, less anything already
 * paid. Floors at zero, so a price DROP after an early payment yields no refund
 * (§5) rather than a negative.
 */
function outstandingOf(fee: FeeDoc, baseAmount: number): number {
  return Math.max(0, computeFee(baseAmount, fee.feeRate) - (fee.paidAmount ?? 0));
}

/** Pro requests completion → client gets a confirm/dispute prompt. */
export const requestCompletion = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const { snap, project } = await loadProject(projectId);

  const proIds = (project.professionalIds as string[]) ?? [];
  if (!proIds.includes(uid)) throw new HttpsError('permission-denied', 'Only a hired professional can request completion');
  const state = (project.completion as { state?: string } | undefined)?.state;
  if (state === 'confirmed') throw new HttpsError('failed-precondition', 'Already confirmed');

  await snap.ref.update({
    completion: { state: 'requested', source: 'pro', requestedBy: uid, requestedAt: FieldValue.serverTimestamp(), remindedDays: [] },
  } as Update);

  await notify({
    userId: project.clientId as string,
    title: 'BAMA',
    message: 'האם הפרויקט הסתיים?',
    data: { type: 'system', chatId: (project.chatId as string) ?? '' },
  });
  return { ok: true };
});

/**
 * Confirm completion. Each professional settles INDEPENDENTLY: a pro who owes
 * keeps their own slot and holds their own review; a pro who is covered by their
 * subscription (or already paid early) frees theirs immediately. One pro paying
 * must never settle the project for the others.
 *
 * Shared by the client callable and the cron auto-confirm.
 */
export async function confirmCompletionInternal(projectId: string, source: 'client' | 'auto'): Promise<void> {
  const { snap, project } = await loadProject(projectId);
  const state = (project.completion as { state?: string } | undefined)?.state;
  if (state === 'confirmed') return; // idempotent

  const proIds = (project.professionalIds as string[]) ?? [];

  // One read of the fee collection, then iterate professionalIds — NOT the fee
  // docs. A pre-correction project has no fee docs at all; iterating the pros and
  // falling back to 'exempt' keeps those working with no backfill.
  const feesSnap = await feesCol(projectId).get();
  const feeMap = new Map<string, FeeDoc>();
  feesSnap.docs.forEach((d) => feeMap.set(d.id, d.data() as FeeDoc));

  const batch = db.batch();
  const stillOwing: string[] = [];   // keep their slot, hold their review
  const settled: string[] = [];      // slot frees now, review publishes
  const owedByPro = new Map<string, number>();

  for (const proId of proIds) {
    const fee = feeMap.get(proId);

    // Missing doc = exempt (permanent legacy fallback); 'included' = covered by
    // this pro's own subscription. Either way nothing is due.
    if (!fee || fee.feeStatus !== 'owed') {
      settled.push(proId);
      if (fee) batch.update(feeRef(projectId, proId), { feeDue: 0, slotActive: false } as Update);
      continue;
    }

    // Top-up only (§5): the base may rise after an early payment, never fall.
    const current = await computeProAmount(projectId, proId);
    const baseAmount = Math.max(fee.baseAmount ?? 0, current);
    const outstanding = outstandingOf(fee, baseAmount);

    if (outstanding > 0) {
      stillOwing.push(proId);
      owedByPro.set(proId, outstanding);
      // feeDue is stored NET of paidAmount — it is what is left to pay.
      batch.update(feeRef(projectId, proId), {
        baseAmount, feeDue: outstanding, feePaid: false, slotActive: true,
      } as Update);
    } else {
      // Paid early, in full — or the price fell far enough that nothing remains.
      settled.push(proId);
      batch.update(feeRef(projectId, proId), {
        baseAmount, feeDue: 0, feePaid: true, slotActive: false,
      } as Update);
    }
  }

  batch.update(snap.ref, {
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    completion: {
      ...(project.completion as object ?? {}),
      state: 'confirmed',
      source,
      confirmedAt: FieldValue.serverTimestamp(),
    },
    // Only the pros who still owe keep a slot. Full overwrite, so a pro who paid
    // early and then owes again (price rose) is correctly re-added here.
    slotHolders: stillOwing,
    slotActive: stillOwing.length > 0,
  } as Update);

  // The group chat becomes read-only once the work is done — the same flag the
  // BAMA System DMs use, so the message-create rule already enforces it.
  // Read-only tracks COMPLETION only, never payment: a pro settling early does
  // not close the chat, and an unpaid completed chat still closes.
  if (project.chatId) {
    batch.update(db.doc(`chats/${project.chatId as string}`), {
      readOnly: true,
      readOnlyReason: 'completed',
      readOnlyAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  // Only the settled pros' reviews publish. A pro who still owes stays held.
  for (const proId of settled) await publishProReview(projectId, proId);

  // Built PER RECIPIENT: each pro owes a different amount, so one interpolated
  // string computed once would be wrong for everyone but one of them.
  for (const proId of proIds) {
    const owed = owedByPro.get(proId);
    await notify({
      userId: proId,
      title: 'BAMA',
      message: owed ? `הפרויקט הושלם — עמלת פלטפורמה ₪${owed}` : 'הפרויקט הושלם',
      data: { type: 'system', chatId: (project.chatId as string) ?? '' },
    });
  }
}

/** Client confirms completion. */
export const confirmCompletion = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const { project } = await loadProject(projectId);
  if (project.clientId !== uid) throw new HttpsError('permission-denied', 'Only the client can confirm');
  await confirmCompletionInternal(projectId, 'client');
  return { ok: true };
});

/** Client disputes → admin review. Slots stay occupied. */
export const disputeCompletion = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const { snap, project } = await loadProject(projectId);
  if (project.clientId !== uid) throw new HttpsError('permission-denied', 'Only the client can dispute');
  if ((project.completion as { state?: string } | undefined)?.state === 'confirmed') {
    throw new HttpsError('failed-precondition', 'Already confirmed');
  }
  await snap.ref.update({
    completion: { ...(project.completion as object ?? {}), state: 'disputed' },
  } as Update);
  return { ok: true };
});

/**
 * Cancel before completion → no fee, every slot frees, chat archived.
 * Reject only if completion is already CONFIRMED. Any pro who already paid
 * (early payment, §5) is flagged for manual refund review — per-pro, since on a
 * multi-pro project a single project-level flag would name the wrong people.
 */
export const cancelProject = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const { snap, project } = await loadProject(projectId);

  const isParty = project.clientId === uid || ((project.professionalIds as string[]) ?? []).includes(uid);
  if (!isParty) throw new HttpsError('permission-denied', 'Not a party to this project');
  if ((project.completion as { state?: string } | undefined)?.state === 'confirmed') {
    throw new HttpsError('failed-precondition', 'Cannot cancel a confirmed project');
  }

  const feesSnap = await feesCol(projectId).get();
  const refundPros: string[] = [];

  const batch = db.batch();
  batch.update(snap.ref, {
    status: 'cancelled',
    cancelledAt: FieldValue.serverTimestamp(),
    slotHolders: [],
    slotActive: false,
  } as Update);

  for (const d of feesSnap.docs) {
    const fee = d.data() as FeeDoc;
    const paid = fee.paidAmount ?? 0;
    const update: Update = { slotActive: false, feeDue: 0 };
    if (paid > 0) {
      update.refundReviewPending = true; // discretionary and manual, per §5
      refundPros.push(d.id);
    }
    batch.update(d.ref, update);
  }

  if (project.chatId) {
    batch.update(db.doc(`chats/${project.chatId as string}`), {
      archived: true, archiveReason: 'cancelled', archivedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return { ok: true, refundReviewPending: refundPros };
});

/**
 * Settle ONE professional's fee on ONE project: credit the payment, free that
 * pro's slot, publish that pro's held review. Shared by markFeePaid (admin) and
 * payFee (the pro themself) so the two can never drift apart.
 *
 * Runs in a transaction because it recomputes the project's derived `slotActive`
 * from `slotHolders`: a concurrent hire adding a pro must not be clobbered back
 * to false, which would strand the project outside lifecycleCron's sweeps.
 */
async function settleFee(projectId: string, proId: string): Promise<{ paid: number }> {
  const projRef = db.doc(`projects/${projectId}`);
  const fRef = feeRef(projectId, proId);

  // Priced before the transaction: computeProAmount runs a query, and Firestore
  // transactions cannot query. Safe — an early payment is priced at that moment
  // by design (§5), and the confirmed path reads feeDue, which is already fixed.
  const preSnap = await fRef.get();
  if (!preSnap.exists) throw new HttpsError('failed-precondition', 'nothing-owed');
  const preFee = preSnap.data() as FeeDoc;
  if (preFee.feeStatus !== 'owed') throw new HttpsError('failed-precondition', 'nothing-owed');
  const currentAmount = await computeProAmount(projectId, proId);

  return db.runTransaction(async (tx) => {
    const [pSnap, fSnap] = await Promise.all([tx.get(projRef), tx.get(fRef)]);
    if (!pSnap.exists) throw new HttpsError('not-found', 'Project not found');
    const project = pSnap.data() as Record<string, unknown>;
    const fee = fSnap.data() as FeeDoc;
    if (fee.feeStatus !== 'owed') throw new HttpsError('failed-precondition', 'nothing-owed');

    const confirmed = (project.completion as { state?: string } | undefined)?.state === 'confirmed';
    // Early: price it now off the pro's current amount, and lock that (§5).
    // Confirmed: feeDue was already stored NET of anything paid earlier.
    const baseAmount = confirmed
      ? (fee.baseAmount ?? 0)
      : Math.max(fee.baseAmount ?? 0, currentAmount);
    const outstanding = confirmed
      ? Math.max(0, fee.feeDue ?? 0)
      : outstandingOf(fee, baseAmount);

    if (outstanding <= 0) throw new HttpsError('failed-precondition', 'already-paid');

    const feeUpdate: Update = {
      paidAmount: FieldValue.increment(outstanding),
      feeDue: 0,
      feePaid: true,
      feePaidAt: FieldValue.serverTimestamp(),
      slotActive: false,
    };
    if (!confirmed) {
      // Early payment: record what the fee was worth on the day they paid.
      feeUpdate.baseAmount = baseAmount;
      feeUpdate.feeLockedAt = FieldValue.serverTimestamp();
      feeUpdate.feeLockedAmount = computeFee(baseAmount, fee.feeRate);
    }
    tx.update(fRef, feeUpdate);

    const holders = ((project.slotHolders as string[]) ?? []).filter((id) => id !== proId);
    tx.update(projRef, { slotHolders: holders, slotActive: holders.length > 0 } as Update);

    return { paid: outstanding };
  }).then(async (result) => {
    // Idempotent, and a no-op before completion — no held review exists yet.
    await publishProReview(projectId, proId);
    return result;
  });
}

/**
 * Admin settle (dev / support). Survives Cardcom: this stays the manual lever.
 */
export const markFeePaid = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);
  const projectId = request.data?.projectId as string | undefined;
  const professionalId = request.data?.professionalId as string | undefined;
  if (!projectId || !professionalId) {
    throw new HttpsError('invalid-argument', 'projectId and professionalId required');
  }
  const { paid } = await settleFee(projectId, professionalId);
  return { ok: true, paid };
});

/**
 * The professional settles their OWN fee.
 *
 * GATED ON `PAYMENTS_ENABLED`. While it is false there is no real payment rail,
 * so this is a fake payment that makes the flow testable end to end. When Cardcom
 * ships and the flag flips to true, this callable MUST refuse every direct call —
 * settlement then happens only through the Cardcom webhook (which credits
 * paidAmount server-side) or the admin-only markFeePaid. The flag closes the hole
 * on its own; nobody has to remember to delete this.
 *
 * Authorization is not "any signed-in user with a project id": the caller must be
 * a hired professional ON THIS PROJECT, their own fee must be 'owed', and there
 * must be something actually outstanding.
 */
export const payFee = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  if (PAYMENTS_ENABLED) {
    throw new HttpsError('failed-precondition', 'payments-live-use-cardcom');
  }
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');

  const { project } = await loadProject(projectId);
  if (!((project.professionalIds as string[]) ?? []).includes(uid)) {
    throw new HttpsError('permission-denied', 'Not hired on this project');
  }

  // Always the caller's own fee — never a professionalId from the request body.
  const { paid } = await settleFee(projectId, uid);
  return { ok: true, paid };
});
