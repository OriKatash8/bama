import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, Timestamp, requireAuth, requireAdmin, notify,
  feeRef, feesCol, computeProAmount, computeFee, publishProReview,
  type FeeDoc, type Ts,
} from './helpers';
import { readConfig } from './config';

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

async function loadProject(projectId: string) {
  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  return { snap, project: snap.data() as Record<string, unknown> };
}

/**
 * What a pro still owes: their fee on their own amount, less anything already
 * paid. Floors at zero, so a price DROP after an early payment yields no refund
 * (§5) rather than a negative — this floor, not a pinned base, is what makes
 * early payments non-refundable.
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
 * Confirm completion.
 *
 * Completion is what ends a project, and it ends it for everyone at once:
 * EVERY slot frees and EVERY review publishes, whatever anyone still owes.
 * What a professional owes BAMA is settled between BAMA and that professional,
 * and is recorded here as a fee record — it does not gate a slot, a review, or
 * anything else inside the app.
 *
 * This used to keep the slot of any pro who still owed, and hold their review,
 * until they paid. That is gone.
 *
 * Fee amounts are still computed PER PROFESSIONAL, on each pro's own accepted
 * amount rather than the project total.
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

  const { disputeWindowDays } = await readConfig();
  const disputeWindowEndsAt = Timestamp.fromMillis(Date.now() + disputeWindowDays * 86400_000);

  const batch = db.batch();
  const owedByPro = new Map<string, number>();

  for (const proId of proIds) {
    const fee = feeMap.get(proId);

    // Missing doc = exempt (the permanent fallback for pre-model projects);
    // 'included' = a legacy subscription-covered hire. Either way nothing is due.
    if (!fee || fee.feeStatus !== 'owed') {
      if (fee) {
        batch.update(feeRef(projectId, proId), {
          feeDue: 0, slotActive: false, status: 'not_owed', projectId,
        } as Update);
      }
      continue;
    }

    // The fee is a percentage of what this pro was ACTUALLY paid, so the base is
    // the current accepted value — a genuine price reduction reduces the fee.
    // The no-refund rule is carried by `outstanding` flooring at zero, not by
    // pinning the base to its hire-time value: pinning would bill a pro on work
    // that was renegotiated down and never paid for.
    const baseAmount = await computeProAmount(projectId, proId);
    const outstanding = outstandingOf(fee, baseAmount);

    // `slotActive: false` on every branch. The slot is released by completion,
    // never by settlement — see the note on the project update below.
    if (outstanding > 0) {
      owedByPro.set(proId, outstanding);
      // feeDue is stored NET of paidAmount — it is what is left to pay.
      batch.update(feeRef(projectId, proId), {
        baseAmount, feeDue: outstanding, feePaid: false, slotActive: false,
        status: 'pending', projectId,
      } as Update);
    } else {
      // Already paid in full, or the price fell far enough that nothing remains.
      batch.update(feeRef(projectId, proId), {
        baseAmount, feeDue: 0, feePaid: true, slotActive: false,
        status: 'paid', projectId,
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
    // EVERY slot frees, whatever is still owed. An outstanding fee is a matter
    // between BAMA and that professional; it must never hold capacity inside the
    // app, because that would make paying the thing that unlocks working again.
    slotHolders: [],
    slotActive: false,
    // The professional's window to dispute this confirmation. Stored on the
    // project so the client can render the deadline without knowing the config,
    // and so disputeFeeByPro has one uniform value to check rather than
    // recomputing from a config that may have changed since.
    disputeWindowEndsAt: disputeWindowEndsAt,
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

  // Every professional's review publishes, unconditionally. New reviews are
  // already published by onReviewCreate; this is the backstop for any that were
  // written before this ran, and it is idempotent.
  for (const proId of proIds) await publishProReview(projectId, proId);

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
    const update: Update = { slotActive: false, feeDue: 0, status: 'not_owed' };
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
 * Record that ONE professional's fee on ONE project has been settled: credit the
 * payment and mark the record paid. That is all it does.
 *
 * It deliberately does NOT free a slot or publish a review. Both of those used to
 * happen here, which made paying the act that unlocked working again and released
 * the client's review — the two things a payment must never buy. Completion
 * releases both now, for everyone, whatever is owed.
 *
 * Reached only through markFeePaid (admin). There is no in-app payment path:
 * settlement happens off-platform and an admin records it here.
 *
 * Still a transaction: `paidAmount` is credited with an increment against a
 * freshly-read outstanding, so two concurrent settlements cannot both apply.
 *
 * REVIEWED EXCEPTION — the `nothing-owed` / `already-paid` throws below are the
 * only place left in the codebase that reads fee state and then refuses. They were
 * audited and deliberately kept: what they gate is the act of RECORDING a payment,
 * reached only through the admin-only `markFeePaid`, and they exist to stop
 * `paidAmount` being double-credited on a fee that is absent, exempt or settled.
 * No slot, review, feature or visibility depends on them.
 *
 * Do not copy this shape into anything a user can reach. "Fee state may not decide
 * what someone can do" has exactly this one carve-out, and it is a bookkeeping
 * guard on the ledger itself.
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
    // Early: price it now off the pro's current accepted amount, and lock that
    // (§5). Confirmed: feeDue was already stored NET of anything paid earlier.
    const baseAmount = confirmed ? (fee.baseAmount ?? 0) : currentAmount;
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
      status: 'paid',
      projectId,
    };
    if (!confirmed) {
      // Settled before completion: record what the fee was worth on that day.
      feeUpdate.baseAmount = baseAmount;
      feeUpdate.feeLockedAt = FieldValue.serverTimestamp();
      feeUpdate.feeLockedAmount = computeFee(baseAmount, fee.feeRate);
    }
    tx.update(fRef, feeUpdate);

    // `project` is read for the not-found guard above and to price a pre-completion
    // settlement. Nothing on the project changes here: slots are completion's.
    void project;

    return { paid: outstanding };
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
 * The professional disputes a completion the client confirmed.
 *
 * Protection, not a veto. The completion STANDS: the project stays completed,
 * every slot stays free and every review stays published. What a dispute does is
 * mark the fee record and put the project in front of a human.
 *
 * Silence is not a veto either — a window that simply expires leaves the
 * completion standing, so nothing has to run when it closes and there is no
 * scheduled job behind this.
 *
 * Distinct from `disputeCompletion`, which is the CLIENT's pre-confirmation
 * objection. Same word, opposite party, opposite side of the confirmation.
 */
export const disputeFeeByPro = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const rawReason = request.data?.reason;
  // Bounded: this lands in a document an admin reads, not in a query.
  const reason = typeof rawReason === 'string' ? rawReason.slice(0, 1000).trim() : '';

  const { snap, project } = await loadProject(projectId);
  if (!((project.professionalIds as string[]) ?? []).includes(uid)) {
    throw new HttpsError('permission-denied', 'Not hired on this project');
  }

  const completion = project.completion as { state?: string; confirmedAt?: Ts } | undefined;
  if (completion?.state !== 'confirmed') {
    throw new HttpsError('failed-precondition', 'not-confirmed');
  }

  // Prefer the deadline stamped at confirmation over recomputing from config:
  // the window a professional was promised must not move because someone edited
  // disputeWindowDays afterwards. The fallback covers projects confirmed before
  // that field existed.
  let endsAt = project.disputeWindowEndsAt as Ts | undefined;
  if (!endsAt) {
    const { disputeWindowDays } = await readConfig();
    const confirmedAt = completion.confirmedAt;
    if (!confirmedAt) throw new HttpsError('failed-precondition', 'no-confirmation-date');
    endsAt = Timestamp.fromMillis(confirmedAt.toMillis() + disputeWindowDays * 86400_000);
  }
  if (Date.now() > endsAt.toMillis()) {
    throw new HttpsError('failed-precondition', 'dispute-window-closed');
  }

  const batch = db.batch();

  // Only the caller's OWN fee record, never a professionalId from the body.
  // A missing record means there is no fee to dispute — the project is still
  // flagged, because the objection is to the completion, not only to the amount.
  const fSnap = await feeRef(projectId, uid).get();
  if (fSnap.exists) {
    batch.update(fSnap.ref, {
      status: 'disputed',
      disputedAt: FieldValue.serverTimestamp(),
      ...(reason ? { disputeReason: reason } : {}),
    } as Update);
  }

  batch.update(snap.ref, {
    adminReviewPending: true,
    adminReview: {
      reason: 'fee_disputed',
      proId: uid,
      at: FieldValue.serverTimestamp(),
      ...(reason ? { note: reason } : {}),
    },
  } as Update);

  await batch.commit();
  return { ok: true };
});
