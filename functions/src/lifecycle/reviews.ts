import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue } from './helpers';

/**
 * Server default so the review hold can NEVER silently fail: if a review is
 * created without an explicit `published`, resolve it from THAT PROFESSIONAL's
 * fee — a pro who still owes holds their review; everyone else publishes
 * immediately. Covers every write path, present and future.
 *
 * Per-pro: on a multi-pro project, one professional owing money must not hold
 * another professional's review.
 */
export const onReviewCreate = onDocumentCreated('reviews/{reviewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const review = snap.data() as Record<string, unknown>;
  if (typeof review.published === 'boolean') return; // client set it explicitly — trust it

  let hold = false;
  const projectId = review.projectId as string | undefined;
  const proId = review.professionalId as string | undefined;
  if ((review.kind ?? 'client_to_pro') === 'client_to_pro' && projectId && proId) {
    const feeSnap = await db.doc(`projects/${projectId}/fees/${proId}`).get();
    if (feeSnap.exists) {
      const fee = feeSnap.data() as { feeStatus?: string; feePaid?: boolean };
      // Hold on "STILL OWES", not on feeStatus alone. feeStatus is immutable by
      // design, so it stays 'owed' forever — including after the pro has paid.
      // Reviews are written AFTER confirmCompletion (the client's ReviewFlow runs
      // off the back of it), so keying on feeStatus alone would permanently hold
      // the review of anyone who settled early, until the 60-day sweep released it.
      hold = fee.feeStatus === 'owed' && fee.feePaid !== true;
    } else {
      // No fee doc = pre-correction project. Fall back to its project-level field.
      const proj = await db.doc(`projects/${projectId}`).get();
      hold = proj.data()?.feeStatus === 'owed';
    }
  }
  await snap.ref.set(
    hold ? { published: false } : { published: true, visibleAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
});
