import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth } from './helpers';

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
 * Refuses once completion is CONFIRMED: otherwise a pro whose fee is owed
 * accepts a removal, loses the slot occupation, and the fee is never collectable
 * (§4.4 — disputes and exits must not free the slot).
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

  if ((project.completion as { state?: string } | undefined)?.state === 'confirmed') {
    throw new HttpsError('failed-precondition', 'Cannot leave a confirmed project');
  }

  const removalRef = db.doc(`projects/${projectId}/removalRequests/${uid}`);
  const [offersSnap, removalSnap] = await Promise.all([
    db
      .collection('priceOffers')
      .where('projectId', '==', projectId)
      .where('professionalId', '==', uid)
      .where('status', '==', 'accepted')
      .get(),
    removalRef.get(),
  ]);

  const batch = db.batch();

  // arrayRemove needs exact object equality, so filledSlots is read-modify-write.
  const update: Update = {
    filledSlots: filled.filter((s) => s.professionalId !== uid),
    professionalIds: FieldValue.arrayRemove(uid),
  };
  batch.update(snap.ref, update);

  const chatId = project.chatId as string | undefined;
  if (chatId) {
    batch.update(db.doc(`chats/${chatId}`), { members: FieldValue.arrayRemove(uid) });
  }

  offersSnap.docs.forEach((d) => batch.update(d.ref, { status: 'removed' }));

  // Absent when the pro leaves through a path that never raised a request —
  // updating a missing doc would fail the whole batch.
  if (removalSnap.exists) batch.update(removalRef, { status: 'accepted' });

  await batch.commit();
  return { ok: true, chatId: chatId ?? null };
});
