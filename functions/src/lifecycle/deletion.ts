import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, feesCol } from './helpers';

const BATCH_LIMIT = 400; // Firestore's hard limit is 500 — leave headroom.

/**
 * Delete a project and everything that hangs off it, server-side.
 *
 * This used to be a client-side cascade (`deleteProjectAndOffers`) issuing raw
 * deletes against priceOffers/bundleOffers. Three things make that untenable:
 *
 *  1. The rules deny those deletes (`allow delete: if false`), so the cascade
 *     would silently orphan every offer while appearing to succeed.
 *  2. `projects/{id}/fees/{proId}` is Admin-SDK-only by design — a client can
 *     NEVER delete it, and subcollections do not die with their parent. A client
 *     cascade would orphan every fee doc, permanently.
 *  3. Orphaned ACCEPTED offers are not inert: `computeProAmount` prices the
 *     platform fee off them, so an orphan pointing at a deleted project is a fee
 *     base with no project behind it.
 *
 * Deleting a HIRED project is refused outright. Otherwise "delete" would be a
 * cleaner escape from an owed fee than anything the gating model contemplates:
 * it would erase the debt, free the slot, and drop the held review in one call.
 * Ending a hired project goes through `cancelProject`, which frees slots without
 * destroying the record.
 */
export const deleteProject = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const projectId = request.data?.projectId as string | undefined;
  if (!projectId) throw new HttpsError('invalid-argument', 'projectId required');

  const projRef = db.doc(`projects/${projectId}`);
  const projSnap = await projRef.get();
  if (!projSnap.exists) return { ok: true, alreadyGone: true };
  const project = projSnap.data() as Record<string, unknown>;

  if (project.clientId !== uid) {
    throw new HttpsError('permission-denied', 'Only the client can delete this project');
  }

  const hired = !!project.chatId || (((project.professionalIds as string[]) ?? []).length > 0);
  if (hired) {
    throw new HttpsError('failed-precondition', 'cannot-delete-hired-project');
  }

  const [offersSnap, bundlesSnap, feesSnap] = await Promise.all([
    db.collection('priceOffers').where('projectId', '==', projectId).get(),
    db.collection('bundleOffers').where('projectId', '==', projectId).get(),
    feesCol(projectId).get(),
  ]);

  // A project can carry more offers than one batch holds, so chunk the deletes.
  const refs = [
    ...offersSnap.docs.map((d) => d.ref),
    ...bundlesSnap.docs.map((d) => d.ref),
    ...feesSnap.docs.map((d) => d.ref),
  ];
  if (project.chatId) refs.push(db.doc(`chats/${project.chatId as string}`));
  refs.push(projRef); // the project itself goes last

  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_LIMIT).forEach((r) => batch.delete(r));
    await batch.commit();
  }

  return {
    ok: true,
    deleted: {
      priceOffers: offersSnap.size,
      bundleOffers: bundlesSnap.size,
      fees: feesSnap.size,
    },
  };
});
