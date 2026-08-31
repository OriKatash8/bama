import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth, requireAdmin, notify, computeFeeDue, publishProjectReview } from './helpers';

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

async function loadProject(projectId: string) {
  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  return { snap, project: snap.data() as Record<string, unknown> };
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
 * Confirm completion. Fee becomes due for `owed` projects (slot stays until paid);
 * `included`/`exempt` settle immediately (slot frees). Shared by the client callable
 * and the cron auto-confirm.
 */
export async function confirmCompletionInternal(projectId: string, source: 'client' | 'auto'): Promise<void> {
  const { snap, project } = await loadProject(projectId);
  const state = (project.completion as { state?: string } | undefined)?.state;
  if (state === 'confirmed') return; // idempotent

  const feeStatus = (project.feeStatus as string) ?? 'exempt';
  const owes = feeStatus === 'owed';
  const feeDue = owes ? await computeFeeDue(projectId) : 0;

  const update: Update = {
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    completion: {
      ...(project.completion as object ?? {}),
      state: 'confirmed',
      source,
      confirmedAt: FieldValue.serverTimestamp(),
    },
    feeDue,
    slotActive: owes ? true : false, // owed keeps the slot until paid; else free it now
  };
  await snap.ref.update(update);

  // Non-owed projects publish their held review immediately (nothing to pay).
  if (!owes) await publishProjectReview(projectId);

  for (const proId of ((project.professionalIds as string[]) ?? [])) {
    await notify({
      userId: proId,
      title: 'BAMA',
      message: owes ? `הפרויקט הושלם — עמלת פלטפורמה ₪${feeDue}` : 'הפרויקט הושלם',
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

/** Client disputes → admin review. Slot stays occupied. */
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
 * Cancel before completion → no fee, slot frees immediately, chat archived.
 * Reject only if completion is already CONFIRMED. If feePaid but not confirmed
 * (early payment, §5): allow, keep the paid fee, flag for manual refund review.
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

  const update: Update = {
    status: 'cancelled',
    cancelledAt: FieldValue.serverTimestamp(),
    slotActive: false,
  };
  if (project.feePaid === true) update.refundReviewPending = true; // early payment → manual refund

  const batch = db.batch();
  batch.update(snap.ref, update);
  if (project.chatId) {
    batch.update(db.doc(`chats/${project.chatId as string}`), {
      archived: true, archiveReason: 'cancelled', archivedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return { ok: true, refundReviewPending: project.feePaid === true };
});

/**
 * FAKE "mark as paid" for slice 1 (admin/dev): settle the fee, free the slot,
 * publish the held review. Cardcom replaces the trigger later.
 */
export const markFeePaid = onCall(async (request) => {
  requireAuth(request.auth?.uid);
  requireAdmin(request.auth?.token);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');
  const { snap } = await loadProject(projectId);
  await snap.ref.update({
    feePaid: true, feePaidAt: FieldValue.serverTimestamp(), slotActive: false,
  } as Update);
  await publishProjectReview(projectId);
  return { ok: true };
});
