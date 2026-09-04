import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth, feeRef, type FeeDoc } from './helpers';

type Filled = { category: string; professionalId: string; requiredCapability?: string };
type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

/**
 * A professional accepts their removal from a project, freeing their slot.
 *
 * The slot is freed by dropping them from `professionalIds` — that, with
 * `slotActive`, is what the cap query in hire.ts counts. The old client-side
 * `acceptRemoval` only rewrote `filledSlots`, so a removed pro stayed blocked
 * forever.
 *
 * Refuses once THIS PRO's own fee is owed and unpaid: otherwise a pro whose fee
 * is due accepts a removal, loses the slot occupation, and the fee is never
 * collectable (§4.4 — disputes and exits must not free the slot). The guard is
 * per-pro, not per-project: another professional owing money on the same project
 * is no reason to trap this one on it.
 */
export const freeSlot = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');

  const snap = await db.doc(`projects/${projectId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Project not found');
  const project = snap.data() as Record<string, unknown>;

  const filled = (project.filledSlots as Filled[]) ?? [];
  const isOnProject =
    ((project.professionalIds as string[]) ?? []).includes(uid) ||
    filled.some((s) => s.professionalId === uid);
  if (!isOnProject) throw new HttpsError('permission-denied', 'Not hired on this project');

  const removalRef = db.doc(`projects/${projectId}/removalRequests/${uid}`);
  const myFeeRef = feeRef(projectId, uid);
  const [offersSnap, removalSnap, feeSnap] = await Promise.all([
    db
      .collection('priceOffers')
      .where('projectId', '==', projectId)
      .where('professionalId', '==', uid)
      .where('status', '==', 'accepted')
      .get(),
    removalRef.get(),
    myFeeRef.get(),
  ]);

  // A missing fee doc is 'exempt' (pre-correction project) — nothing to collect,
  // so leaving is always allowed there.
  const fee = feeSnap.exists ? (feeSnap.data() as FeeDoc) : null;
  const owesNow = !!fee && fee.feeStatus === 'owed' && fee.feePaid !== true;
  if (owesNow && (project.completion as { state?: string } | undefined)?.state === 'confirmed') {
    throw new HttpsError('failed-precondition', 'Cannot leave a confirmed project with a fee outstanding');
  }

  const batch = db.batch();

  // arrayRemove needs exact object equality, so filledSlots is read-modify-write.
  const holders = ((project.slotHolders as string[]) ?? []).filter((id) => id !== uid);
  const update: Update = {
    filledSlots: filled.filter((s) => s.professionalId !== uid),
    professionalIds: FieldValue.arrayRemove(uid),
    // This pro stops occupying a slot; the others keep theirs.
    slotHolders: holders,
    slotActive: holders.length > 0,
  };
  batch.update(snap.ref, update);

  // Void this pro's fee — they leave before completion, so nothing is due (§4.3:
  // a pro must never pay for work that earned them nothing). Anything already
  // paid early stays recorded in paidAmount for the manual refund path.
  if (feeSnap.exists) {
    batch.update(myFeeRef, { slotActive: false, feeDue: 0 } as Update);
  }

  const chatId = project.chatId as string | undefined;
  if (chatId) {
    batch.update(db.doc(`chats/${chatId}`), { members: FieldValue.arrayRemove(uid) });
  }

  offersSnap.docs.forEach((d) => batch.update(d.ref, { status: 'removed' }));

  // DELETE, not mark-accepted. A request left behind is never removable
  // (`allow delete: if false` for clients), so if this professional is ever
  // re-hired onto the same project the client's next remove press would be a
  // rules update on a stale doc — and they could never be removed again.
  // The Admin SDK bypasses rules, so no rule change is needed for this.
  // Absent when the pro leaves through a path that never raised a request;
  // deleting a missing doc is a no-op, unlike updating one.
  if (removalSnap.exists) batch.delete(removalRef);

  await batch.commit();
  return { ok: true, chatId: chatId ?? null };
});
