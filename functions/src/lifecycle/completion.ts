import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  db, FieldValue, Timestamp, requireAuth, requireAdmin, notify,
  feeRef, feesCol, computeProAmount, computeFee, publishProReview, contestWindowEndsAt,
  type FeeDoc,
} from './helpers';
import { readConfig } from './config';
import { applyDerivedProjectState } from './derive';
import { releaseEngagement } from './removal';
import { warnIfCompletedUnderReview } from './review';

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
  // `minFeeApplied ?? 0` — THIS pro's locked floor, never the live config. A
  // record predating the floor has none and prices exactly as it always did.
  return Math.max(
    0,
    computeFee(baseAmount, fee.feeRate, fee.minFeeApplied ?? 0) - (fee.paidAmount ?? 0),
  );
}

/**
 * LEGACY ALIAS for `requestEngagementEnd({ kind: 'finished' })`.
 *
 * Kept and kept working because installed app builds call this name. It is the
 * 'finished' half only — a build that predates the split cannot have asked to
 * withdraw, so mapping it there is the honest reading, and it is also the branch
 * that charges, so an old client can never take the cheaper path by accident.
 */
export const requestCompletion = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const { project } = await loadProject(projectId);

  const proIds = (project.professionalIds as string[]) ?? [];
  if (!proIds.includes(uid)) throw new HttpsError('permission-denied', 'Only a hired professional can request completion');
  // Guarded on THIS engagement, not the project cache. Another professional's
  // engagement being confirmed says nothing about whether this one may ask.
  const mySnap = await feeRef(projectId, uid).get();
  const mine = mySnap.data() as FeeDoc | undefined;
  if (mine?.engagementStatus === 'completed') {
    throw new HttpsError('failed-precondition', 'Already confirmed');
  }

  const clientId = project.clientId as string;
  const batch = db.batch();
  // THE ENGAGEMENT, not the project. The project's copy is a cache written only
  // by the derivation — see derive.ts. `remindedDays` lives here too, so one
  // professional's reminder no longer marks the day sent for everyone.
  batch.update(feeRef(projectId, uid), {
    engagementStatus: 'end_requested_by_pro',
    completion: {
      state: 'requested',
      source: 'pro',
      requestedBy: uid,
      requestedAt: FieldValue.serverTimestamp(),
      remindedDays: [],
      endKind: 'finished',
    },
  } as Update);

  // The chat notice, ATOMIC with the state change — the same shape
  // createPaymentRequest uses, and for the same reason: a request that landed
  // with no heads-up leaves the counterparty waiting on something they cannot
  // see. Completion was the only lifecycle event that posted nothing here, so a
  // professional asking to close a project was invisible in the one place the
  // client actually looks.
  if (project.chatId) {
    const proSnap = await db.doc(`users/${uid}`).get();
    const proName = (proSnap.data()?.displayName as string | undefined) ?? '';
    const text = proName
      ? `🏁 בקשת סיום פרויקט: ${proName} מבקש/ת לסמן את הפרויקט כהושלם`
      : '🏁 בקשת סיום פרויקט';
    batch.set(db.collection(`chats/${project.chatId as string}/messages`).doc(), {
      senderId: 'system', system: true, text,
      timestamp: FieldValue.serverTimestamp(), readBy: [],
    });
    batch.update(db.doc(`chats/${project.chatId as string}`), {
      lastMessage: { text, senderId: 'system', timestamp: FieldValue.serverTimestamp() },
      [`unreadCount.${clientId}`]: FieldValue.increment(1),
    });
  }
  await batch.commit();

  await notify({
    userId: clientId,
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
/** Engagement states that are finished and must never be re-processed. */
const TERMINAL_ENGAGEMENT = new Set(['completed', 'withdrawn', 'cancelled']);

export async function confirmCompletionInternal(
  projectId: string,
  source: 'client' | 'auto',
  /** Confirm ONE engagement instead of every open one. The client gets both
   *  actions — close one professional, or close them all — and they are the same
   *  code path with a filter rather than two implementations of charging a fee. */
  onlyProId?: string,
): Promise<void> {
  const { snap, project } = await loadProject(projectId);

  // The idempotency guard is PER ENGAGEMENT now, and the old project-level one
  // was actively wrong once completion became per-engagement. It returned early
  // on project.completion.state === 'confirmed' — but that field is a derived
  // cache, so after one engagement closed on its own the project was still open,
  // the guard passed, and the loop re-processed the engagement that had already
  // finished, re-setting feePaid: false on a settled fee.
  //
  // Skipping terminal engagements below delivers three things at once: nothing
  // is charged twice, withdrawn and cancelled engagements are never charged at
  // all, and a disputed engagement holds only its own fee while its neighbours
  // complete normally.

  const proIds = (project.professionalIds as string[]) ?? [];

  // One read of the fee collection, then iterate professionalIds — NOT the fee
  // docs. A pre-correction project has no fee docs at all; iterating the pros and
  // falling back to 'exempt' keeps those working with no backfill.
  const feesSnap = await feesCol(projectId).get();
  const feeMap = new Map<string, FeeDoc>();
  feesSnap.docs.forEach((d) => feeMap.set(d.id, d.data() as FeeDoc));

  // ONE field now. This used to stamp `disputeWindowEndsAt`, which meant the same
  // thing as `chargeDueAt` and was written by a different path — see
  // contestWindowEndsAt for why that pair was dangerous rather than merely
  // redundant.
  const { chargeWindowDays } = await readConfig();
  const chargeDueAt = Timestamp.fromMillis(Date.now() + chargeWindowDays * 86400_000);

  const batch = db.batch();
  const owedByPro = new Map<string, number>();
  /** Professionals whose engagement this run actually closes — the ones whose
   *  slot must be given back. */
  const closedPros: string[] = [];

  for (const proId of proIds) {
    if (onlyProId && proId !== onlyProId) continue;
    const fee = feeMap.get(proId);

    // Already finished — by an earlier single-engagement confirmation, by a
    // withdrawal, or with the project. Skip it entirely: do not recompute, do not
    // re-stamp, do not charge.
    if (fee && TERMINAL_ENGAGEMENT.has(fee.engagementStatus ?? '')) continue;

    // Missing doc = exempt (the permanent fallback for pre-model projects);
    // 'included' = a legacy subscription-covered hire. Either way nothing is due.
    if (!fee || fee.feeStatus !== 'owed') {
      if (fee) {
        closedPros.push(proId);
        batch.update(feeRef(projectId, proId), {
          feeDue: 0, slotActive: false, status: 'not_owed', projectId,
          // Exempt or legacy-subscription: nothing was owed, but the engagement
          // still closed with the project. Terminal, so it does not hold the
          // derivation open.
          engagementStatus: 'completed', chargeDueAt,
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
    // THIS engagement's own closure. The dispute window is stamped per
    // engagement rather than per project: one client action closing four
    // engagements opens four independent windows, and the single project field
    // could only ever describe one of them.
    closedPros.push(proId);
    const engagementClose = {
      engagementStatus: 'completed' as const,
      chargeDueAt,
      completion: {
        state: 'confirmed' as const,
        source,
        confirmedAt: FieldValue.serverTimestamp(),
      },
    };

    if (outstanding > 0) {
      owedByPro.set(proId, outstanding);
      // feeDue is stored NET of paidAmount — it is what is left to pay.
      batch.update(feeRef(projectId, proId), {
        baseAmount, feeDue: outstanding, feePaid: false, slotActive: false,
        status: 'pending', projectId, ...engagementClose,
      } as Update);
    } else {
      // Already paid in full, or the price fell far enough that nothing remains.
      batch.update(feeRef(projectId, proId), {
        baseAmount, feeDue: 0, feePaid: true, slotActive: false,
        status: 'paid', projectId, ...engagementClose,
      } as Update);
    }
  }

  // THE PROJECT IS NOT SET COMPLETE HERE. Confirming one engagement must not
  // close a project other people are still working on, and even confirming every
  // open one leaves the question to the roll-up — a disputed engagement holds the
  // project open however many others just finished. `status`, `completedAt`,
  // `completion` and the project-level `disputeWindowEndsAt` are written by
  // applyDerivedProjectState below, from the engagements this batch stamped.
  //
  // THE SLOT IS RELEASED HERE, though, per professional. `slotActive: false` on
  // the engagement is not enough: the open-project cap counts
  // `slotHolders array-contains proId` on the PROJECT, so a professional whose
  // engagement finished while the project ran on would keep a slot consumed and
  // be unable to take the work they just freed themselves up for.
  if (closedPros.length > 0) {
    batch.update(snap.ref, {
      slotHolders: FieldValue.arrayRemove(...closedPros),
      // `professionalIds` is deliberately NOT touched — it is the record of
      // everyone ever hired, and finishing does not un-hire you.
    } as Update);
  }

  // The group chat becomes read-only once the work is done — the same flag the
  // BAMA System DMs use, so the message-create rule already enforces it.
  // Read-only tracks COMPLETION only, never payment: a pro settling early does
  // not close the chat, and an unpaid completed chat still closes.
  if (project.chatId) {
    // The closing notice, in the SAME write that closes the chat. readOnly gates
    // the message-create RULE and the Admin SDK is not subject to it, so ordering
    // is not a concern — but both land together or neither does. Without this the
    // chat simply stopped, with nothing saying why.
    const text = '🏁 הפרויקט הושלם';
    batch.set(db.collection(`chats/${project.chatId as string}/messages`).doc(), {
      senderId: 'system', system: true, text,
      timestamp: FieldValue.serverTimestamp(), readBy: [],
    });
    // ONE update on the chat document, not two — a batch applies writes to the
    // same document in order, but expressing it as a single write removes the
    // question entirely.
    batch.update(db.doc(`chats/${project.chatId as string}`), {
      readOnly: true,
      readOnlyReason: 'completed',
      readOnlyAt: FieldValue.serverTimestamp(),
      lastMessage: { text, senderId: 'system', timestamp: FieldValue.serverTimestamp() },
    });
  }
  await batch.commit();

  // C6: observation only. Never blocks or changes a completion.
  await Promise.all(closedPros.map((proId) => warnIfCompletedUnderReview(projectId, proId)));

  // The project's own status is now DERIVED from the engagements this batch just
  // closed, rather than asserted alongside them. It is written above too, so the
  // common case needs no correction — this catches the case the direct write
  // cannot see: an engagement left open or disputed by another path means the
  // project is NOT complete, whatever this confirmation did.
  await applyDerivedProjectState(projectId);

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
  const { project } = await loadProject(projectId);
  if (project.clientId !== uid) throw new HttpsError('permission-denied', 'Only the client can dispute');

  // The client rejecting "I'm done" now lands on the ENGAGEMENTS that said it,
  // not on the project. On a multi-professional project only the ones who
  // actually asked are disputed; the rest carry on untouched, which the single
  // project-level flag could not express.
  const feesSnap = await feesCol(projectId).get();
  const open = feesSnap.docs.filter((d) => {
    const st = (d.data() as FeeDoc).engagementStatus;
    return st === 'end_requested_by_pro' || st === 'end_requested_by_client';
  });
  if (open.length === 0) {
    throw new HttpsError('failed-precondition', 'nothing-to-dispute');
  }

  const batch = db.batch();
  for (const d of open) {
    batch.update(d.ref, {
      engagementStatus: 'disputed',
      adminReviewPending: true,
      adminReview: { reason: 'completion_unanswered', at: FieldValue.serverTimestamp() },
    } as Update);
  }
  await batch.commit();
  await applyDerivedProjectState(projectId);
  return { ok: true, disputed: open.length };
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
    // CANCELLED, distinct from withdrawn: the project ended under everyone, not
    // this professional stepping away from it.
    const update: Update = {
      slotActive: false, feeDue: 0, status: 'not_owed',
      engagementStatus: 'cancelled',
    };
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
  await applyDerivedProjectState(projectId);
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
 * REVIEWED EXCEPTION — the `nothing-owed` / `already-paid` throws below gate the
 * act of RECORDING a payment, reached only through the admin-only `markFeePaid`,
 * and they exist to stop `paidAmount` being double-credited on a fee that is
 * absent, exempt or settled. No slot, review, feature or visibility depends on them.
 *
 * THE RULE, in its current form: a fee never gates anything INSIDE the app — no
 * slot, no review, no feature, no visibility, and nothing a payment could unlock.
 * There are exactly two carve-outs, both audited:
 *   1. this one, a bookkeeping guard on the ledger itself; and
 *   2. `feeBlocksNewHire`, which withholds the taking-on of new REAL-WORLD work
 *      from a professional past the grace period on an invoice an admin sent —
 *      unreachable by anyone with a clean account, and unclearable from inside
 *      the app.
 *
 * Do not copy either shape anywhere else. In particular, nothing that a payment
 * inside the app could switch off may ever depend on fee state.
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
  // `feeStatus` alone is NOT enough. cancelProject, freeSlot and the archive sweep
  // all void a fee with `status: 'not_owed'` + `feeDue: 0` and deliberately leave
  // `feeStatus` at 'owed' (it records what was agreed at hire, and is immutable).
  // Before the commission floor existed that gap was harmless: the pre-completion
  // branch below priced a dead project at 0 and fell out on 'already-paid'. With a
  // floor it prices at the minimum instead, so an admin could record — and the
  // ledger would assert — a fee on a project the rest of the code calls not-owed.
  if (preFee.status === 'not_owed') throw new HttpsError('failed-precondition', 'nothing-owed');
  const currentAmount = await computeProAmount(projectId, proId);

  return db.runTransaction(async (tx) => {
    const [pSnap, fSnap] = await Promise.all([tx.get(projRef), tx.get(fRef)]);
    if (!pSnap.exists) throw new HttpsError('not-found', 'Project not found');
    const project = pSnap.data() as Record<string, unknown>;
    const fee = fSnap.data() as FeeDoc;
    if (fee.feeStatus !== 'owed') throw new HttpsError('failed-precondition', 'nothing-owed');
    // Re-checked inside the transaction, like feeStatus above: the project could
    // have been cancelled between the pre-read and here.
    if (fee.status === 'not_owed') throw new HttpsError('failed-precondition', 'nothing-owed');

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
      feeUpdate.feeLockedAmount = computeFee(baseAmount, fee.feeRate, fee.minFeeApplied ?? 0);
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
/**
 * Admin records that the payment demand has been sent to this professional.
 *
 * This is what starts the arrears clock. Nothing else does: `feeDue` becoming a
 * number means the fee fell due, not that anyone asked for it, and blocking on
 * that would put a professional in arrears the day after they finished a job.
 * The gate in `hireProfessional` counts `paymentFailureGraceDays` from here, and
 * a fee with no stamp never blocks anything.
 *
 * IDEMPOTENT BY REFUSAL, not by overwrite: a second click must not restart the
 * clock, because that would silently extend the grace period every time an admin
 * re-sent a demand. Re-sending is a real thing to do; moving the deadline is not.
 *
 * Bookkeeping only, like markFeePaid — it moves no money and unlocks nothing.
 */
export const markDemandSent = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);
  const projectId = request.data?.projectId as string | undefined;
  const professionalId = request.data?.professionalId as string | undefined;
  if (!projectId || !professionalId) {
    throw new HttpsError('invalid-argument', 'projectId and professionalId required');
  }

  const fRef = feeRef(projectId, professionalId);
  const snap = await fRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'no-fee-record');
  const fee = snap.data() as FeeDoc;

  // A demand for a fee that is not owed, already settled, or voided by a
  // cancellation is a bookkeeping error, not a state to record.
  if (fee.feeStatus !== 'owed') throw new HttpsError('failed-precondition', 'nothing-owed');
  if (fee.status === 'not_owed') throw new HttpsError('failed-precondition', 'nothing-owed');
  if (fee.feePaid === true || fee.status === 'paid') {
    throw new HttpsError('failed-precondition', 'already-paid');
  }
  if (fee.demandSentAt) {
    throw new HttpsError('failed-precondition', 'demand-already-sent');
  }

  await fRef.update({ demandSentAt: FieldValue.serverTimestamp() } as Update);
  return { ok: true };
});

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
/**
 * TEMPORARY ALIAS, kept only for installed builds — the same treatment
 * `requestCompletion` got.
 *
 * Maps to `contestEngagement({ reason: 'amount_disputed' })`. A build that
 * predates the split cannot have meant "it never happened", and
 * `amount_disputed` is the branch that HOLDS the fee rather than voiding it, so
 * an old client can never void a fee by accident. Delete once no build calls it.
 */
export const disputeFeeByPro = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');

  const engRef = feeRef(projectId, uid);
  const eng = (await engRef.get()).data() as FeeDoc | undefined;
  if (!eng) throw new HttpsError('not-found', 'no-engagement');

  // The SAME window contestEngagement enforces, through the same accessor. The
  // first version of this alias checked no window at all, which would have let a
  // professional on an old build dispute a fee indefinitely — the precise failure
  // that having two fields invites.
  const dueAt = contestWindowEndsAt(eng)?.toMillis();
  if (typeof dueAt !== 'number') {
    throw new HttpsError('failed-precondition', 'no-charge-window');
  }
  if (Date.now() > dueAt) {
    throw new HttpsError('failed-precondition', 'contest-window-closed');
  }

  const note = boundedReason(request.data?.reason);
  await engRef.update({
    engagementStatus: 'disputed',
    disputedAt: FieldValue.serverTimestamp(),
    ...(note ? { disputeReason: note } : {}),
    adminReviewPending: true,
    adminReview: {
      reason: 'fee_disputed',
      at: FieldValue.serverTimestamp(),
      ...(note ? { note } : {}),
    },
  } as Update);

  // THE SLOT COMES BACK. Completing released it (see completeEngagementInternal),
  // so without this a professional could complete, contest, and walk away with
  // both a freed slot and a voided fee — a standing evasion route with only an
  // admin queue behind it. A disputed engagement is unfinished business and holds
  // its capacity until someone resolves it, which also points the incentive the
  // right way: the professional now wants it settled.
  await db.doc(`projects/${projectId}`).update({
    slotHolders: FieldValue.arrayUnion(uid),
  } as Update);

  await applyDerivedProjectState(projectId);
  return { ok: true };
});

// ── Phase 3: the professional's own engagement ──────────────────────────────

/** Bound free text that lands in a document an admin reads, not in a query. */
const boundedReason = (raw: unknown): string =>
  typeof raw === 'string' ? raw.slice(0, 1000).trim() : '';

/**
 * A professional ends their own engagement — and is made to say WHICH end.
 *
 * The two outcomes are opposite. "I finished my part" charges the commission and
 * unlocks the mutual review; "I'm leaving" charges nothing and frees the slot.
 * A professional who did the work and wants to avoid the 3% can only do it by
 * claiming the second, so the choice is explicit, recorded, and answerable by the
 * client — whose reject is the guard.
 *
 * Neither outcome happens here. This only asks; the client's response decides,
 * and silence decides nothing at all.
 */
export const requestEngagementEnd = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  const kind = request.data?.kind as 'finished' | 'withdrawing' | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  if (kind !== 'finished' && kind !== 'withdrawing') {
    // No default. Defaulting here would let a professional end up in the cheaper
    // branch without having chosen it, which is the entire thing this guards.
    throw new HttpsError('invalid-argument', 'kind must be finished or withdrawing');
  }

  const { project } = await loadProject(projectId);
  if (!((project.professionalIds as string[]) ?? []).includes(uid)) {
    throw new HttpsError('permission-denied', 'Not hired on this project');
  }

  const engRef = feeRef(projectId, uid);
  const mine = (await engRef.get()).data() as FeeDoc | undefined;
  if (mine && TERMINAL_ENGAGEMENT.has(mine.engagementStatus ?? '')) {
    throw new HttpsError('failed-precondition', 'engagement-already-closed');
  }

  await engRef.update({
    engagementStatus: 'end_requested_by_pro',
    completion: {
      state: 'requested',
      source: 'pro',
      requestedBy: uid,
      requestedAt: FieldValue.serverTimestamp(),
      remindedDays: [],
      endKind: kind,
      ...(boundedReason(request.data?.reason)
        ? { endReason: boundedReason(request.data?.reason) } : {}),
    },
  } as Update);

  await applyDerivedProjectState(projectId);
  return { ok: true, kind };
});

/**
 * The client answers one professional's request to end.
 *
 * Four outcomes, and the fee differs in every one:
 *   accept + finished     -> completed, commission charged
 *   accept + withdrawing  -> withdrawn, nothing charged, ever, slot released
 *   reject (either)       -> disputed, fee held, a human decides
 *   no answer             -> nothing here; the cron escalates and never withdraws
 *
 * The reject branch is the fee-evasion guard. A professional who delivered and
 * then claimed to be withdrawing is caught precisely here, by the one party who
 * knows whether the work happened.
 */
export const respondToEngagementEnd = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  const professionalId = request.data?.professionalId as string | undefined;
  const accept = request.data?.accept;
  if (!projectId || !professionalId) {
    throw new HttpsError('invalid-argument', 'projectId and professionalId required');
  }
  if (typeof accept !== 'boolean') {
    throw new HttpsError('invalid-argument', 'accept must be a boolean');
  }

  const { project } = await loadProject(projectId);
  // Authorization: the CLIENT answers. The mirror flow (freeSlot) checks the
  // opposite — that the caller is the professional — and calls the same
  // mechanics. Neither check lives in releaseEngagement.
  if (project.clientId !== uid) {
    throw new HttpsError('permission-denied', 'Only the client can respond');
  }

  const engRef = feeRef(projectId, professionalId);
  const eng = (await engRef.get()).data() as FeeDoc | undefined;
  if (eng?.engagementStatus !== 'end_requested_by_pro') {
    throw new HttpsError('failed-precondition', 'no-open-request');
  }
  const kind = eng.completion?.endKind ?? 'finished';

  if (!accept) {
    const note = boundedReason(request.data?.reason);
    await engRef.update({
      engagementStatus: 'disputed',
      adminReviewPending: true,
      adminReview: {
        // A rejected withdrawal and a rejected completion are different claims
        // for an admin to weigh, so they are labelled differently.
        reason: kind === 'withdrawing' ? 'withdrawal_rejected' : 'fee_disputed',
        at: FieldValue.serverTimestamp(),
        ...(note ? { note } : {}),
      },
    } as Update);
    await applyDerivedProjectState(projectId);
    return { ok: true, outcome: 'disputed' };
  }

  if (kind === 'withdrawing') {
    // NO FEE, by this route, ever. releaseEngagement voids it unconditionally.
    await releaseEngagement(projectId, professionalId, 'pro_withdrew');
    return { ok: true, outcome: 'withdrawn' };
  }

  // Finished: charge this engagement and only this one.
  await confirmCompletionInternal(projectId, 'client', professionalId);
  return { ok: true, outcome: 'completed' };
});

/**
 * The client closes every engagement still open on the project, in one action.
 *
 * Idempotent, and skipping is the mechanism rather than a special case:
 * confirmCompletionInternal passes over any engagement already terminal, so a
 * completed one is not re-charged, a withdrawn one is not charged at all, and a
 * disputed one is left for a human while its neighbours finish.
 *
 * Each engagement closed here gets its OWN dispute window from its own
 * confirmedAt, so one press can open several independent ones.
 *
 * The single-engagement action stays: the client may close one professional or
 * all of them.
 */
export const completeAllEngagements = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const { project } = await loadProject(projectId);
  if (project.clientId !== uid) {
    throw new HttpsError('permission-denied', 'Only the client can confirm');
  }
  await confirmCompletionInternal(projectId, 'client');
  return { ok: true };
});

// ── Phase 4: the professional marks, the deadline backstops ─────────────────

/**
 * Close ONE engagement and open its charge window. Shared by the professional
 * marking it and the cron auto-completing it, so the two can never diverge on
 * what completion means.
 *
 * `chargeDueAt` is both the moment the fee charges and the deadline for saying
 * it did not happen — one date, so there is no gap in which a professional can
 * be charged for something they were still entitled to contest.
 */
export async function completeEngagementInternal(
  projectId: string,
  proId: string,
  source: 'pro' | 'auto' | 'client',
): Promise<{ completed: boolean; reason?: string }> {
  const engRef = feeRef(projectId, proId);
  const eng = (await engRef.get()).data() as FeeDoc | undefined;
  if (!eng) return { completed: false, reason: 'no-engagement' };
  if (TERMINAL_ENGAGEMENT.has(eng.engagementStatus ?? '')) {
    return { completed: false, reason: 'already-terminal' };
  }

  const { chargeWindowDays } = await readConfig();
  const chargeDueAt = Timestamp.fromMillis(Date.now() + chargeWindowDays * 86400_000);

  // The fee is priced HERE, from the accepted offers as they stand, exactly as
  // the old confirmation path priced it. The floor and rate come off the
  // engagement's own snapshot, never from live config.
  const baseAmount = await computeProAmount(projectId, proId);
  const outstanding = eng.feeStatus === 'owed' ? outstandingOf(eng, baseAmount) : 0;

  await engRef.update({
    engagementStatus: 'completed',
    baseAmount,
    feeDue: outstanding,
    feePaid: outstanding <= 0,
    status: eng.feeStatus === 'owed' ? (outstanding > 0 ? 'pending' : 'paid') : 'not_owed',
    slotActive: false,
    chargeDueAt,
    completion: {
      state: 'confirmed',
      source,
      confirmedAt: FieldValue.serverTimestamp(),
    },
    projectId,
  } as Update);

  // The slot goes back now, not at charge time. The work is done; holding
  // capacity through the charge window would make the fee gate capacity, which
  // is the thing that must never happen.
  await db.doc(`projects/${projectId}`).update({
    slotHolders: FieldValue.arrayRemove(proId),
  } as Update);

  // C6: observation only. Never blocks or changes a completion.
  await warnIfCompletedUnderReview(projectId, proId);

  await applyDerivedProjectState(projectId);
  return { completed: true };
}

/**
 * The professional marks their own engagement complete. This is now the primary
 * trigger: the client has already paid them outside the app, so confirming
 * bought the client nothing and the flow waited on the one party with no reason
 * to act. The professional has reasons — reviews and capacity — and
 * `completionDueAt` covers them not acting either.
 */
export const markEngagementComplete = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const { project } = await loadProject(projectId);
  if (!((project.professionalIds as string[]) ?? []).includes(uid)) {
    throw new HttpsError('permission-denied', 'Not hired on this project');
  }
  const res = await completeEngagementInternal(projectId, uid, 'pro');
  if (!res.completed) throw new HttpsError('failed-precondition', res.reason ?? 'cannot-complete');
  return { ok: true };
});

/**
 * The professional contests their own engagement, before `chargeDueAt`.
 *
 * TWO REASONS, NO DEFAULT. `didnt_happen` voids the fee — the shoot was called
 * off and charging for it would bill someone for work that never existed.
 * `amount_disputed` holds it — the work happened, the number is wrong. An absent
 * or unrecognised reason is rejected rather than defaulted, for the same reason
 * requestEngagementEnd refuses to guess: defaulting hands the professional the
 * cheaper branch without them having chosen it.
 */
export const contestEngagement = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  const reason = request.data?.reason as 'didnt_happen' | 'amount_disputed' | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  if (reason !== 'didnt_happen' && reason !== 'amount_disputed') {
    throw new HttpsError('invalid-argument', 'reason must be didnt_happen or amount_disputed');
  }

  const engRef = feeRef(projectId, uid);
  const eng = (await engRef.get()).data() as FeeDoc | undefined;
  if (!eng) throw new HttpsError('not-found', 'no-engagement');

  // The window is the charge date. Past it the money has moved (or would have),
  // and a contest becomes a support conversation rather than a state change.
  const dueAt = contestWindowEndsAt(eng)?.toMillis();
  if (typeof dueAt !== 'number') {
    throw new HttpsError('failed-precondition', 'no-charge-window');
  }
  if (Date.now() > dueAt) {
    throw new HttpsError('failed-precondition', 'contest-window-closed');
  }

  const note = boundedReason(request.data?.note);
  await engRef.update({
    engagementStatus: 'disputed',
    ...(reason === 'didnt_happen'
      // Voided outright. A shoot that never happened owes nothing, and leaving
      // the fee live would charge at chargeDueAt while an admin was still
      // looking at it.
      ? { feeDue: 0, status: 'not_owed' as const }
      // Held, not voided: the work happened and something is owed; how much is
      // what the admin decides.
      : {}),
    disputedAt: FieldValue.serverTimestamp(),
    ...(note ? { disputeReason: note } : {}),
    adminReviewPending: true,
    adminReview: {
      reason: reason === 'didnt_happen' ? 'didnt_happen' : 'fee_disputed',
      at: FieldValue.serverTimestamp(),
      ...(note ? { note } : {}),
    },
  } as Update);

  // THE SLOT COMES BACK. Completing released it (see completeEngagementInternal),
  // so without this a professional could complete, contest, and walk away with
  // both a freed slot and a voided fee — a standing evasion route with only an
  // admin queue behind it. A disputed engagement is unfinished business and holds
  // its capacity until someone resolves it, which also points the incentive the
  // right way: the professional now wants it settled.
  await db.doc(`projects/${projectId}`).update({
    slotHolders: FieldValue.arrayUnion(uid),
  } as Update);

  await applyDerivedProjectState(projectId);
  return { ok: true, reason };
});
