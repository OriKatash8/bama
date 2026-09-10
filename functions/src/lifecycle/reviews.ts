import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from './helpers';

/**
 * Resolve `published` on every new review.
 *
 * A review publishes on creation, ALWAYS. It is never held, delayed, or made
 * rating-neutral pending a platform fee, a project state, or anything else.
 *
 * This used to read `projects/{projectId}/fees/{professionalId}` and write
 * `published: false` whenever that professional still owed their commission —
 * the review was the lever that made them pay. That is gone. A review is the
 * client's account of work that happened; what a professional owes BAMA is a
 * separate matter between BAMA and the professional, and must not change what
 * anyone else can see.
 *
 * The `published` field, the get/list rules split in firestore.rules, and
 * publishProReview() all remain in place. They now describe a state nothing
 * enters: every review is written published, and the 60-day cron sweep is a
 * backstop for anything that somehow is not.
 */
export const onReviewCreate = onDocumentCreated('reviews/{reviewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  // A client cannot set `published` itself — firestore.rules rejects a create
  // carrying `published` or `visibleAt` — so this trigger is the only writer,
  // and it has exactly one answer.
  await snap.ref.set(
    { published: true, visibleAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
});
