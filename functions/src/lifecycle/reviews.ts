import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue } from './helpers';

/**
 * Server default so the review hold can NEVER silently fail: if a review is
 * created without an explicit `published`, resolve it from the project's fee
 * status — `owed` projects hold the review (published:false); everything else
 * publishes immediately. Covers every write path, present and future.
 */
export const onReviewCreate = onDocumentCreated('reviews/{reviewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const review = snap.data() as Record<string, unknown>;
  if (typeof review.published === 'boolean') return; // client set it explicitly — trust it

  let hold = false;
  const projectId = review.projectId as string | undefined;
  if ((review.kind ?? 'client_to_pro') === 'client_to_pro' && projectId) {
    const proj = await db.doc(`projects/${projectId}`).get();
    hold = proj.data()?.feeStatus === 'owed';
  }
  await snap.ref.set(
    hold ? { published: false } : { published: true, visibleAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
});
