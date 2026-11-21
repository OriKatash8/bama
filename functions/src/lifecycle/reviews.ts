import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue, feeRef, type FeeDoc } from './helpers';
import { isDidntHappenDispute } from './reviewHold';

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
 * ONE EXCEPTION, tied to a dispute and not to payment: a review of a professional
 * whose engagement is disputed as "didn't happen" is written held
 * (`published: false, heldForDispute: true`) and settled when an admin resolves the
 * dispute (reviewHold.ts). Nothing else may write `published: false`.
 *
 * The `published` field, the get/list rules split in firestore.rules, and
 * publishProReview() all remain in place. They now describe a state nothing
 * enters: every review is written published, and the 60-day cron sweep is a
 * backstop for anything that somehow is not.
 */
/**
 * `update()`, never `set(..., { merge: true })`. A merge-set CREATES the document when it is missing, so a
 * review deleted between its creation and this trigger's write (a probe cleaning up, or a dispute resolved
 * "cancelled" within seconds of the review being written) came back as an empty
 * `{ published: true, visibleAt }` stub: no rating, no text, but listed as published. An update of a
 * document that is gone is NOT_FOUND; that means the review no longer exists and there is nothing to
 * publish or hold, so it is logged and ignored. Any other error is real and is rethrown.
 */
export async function updateIfExists(
  ref: { update: (data: Record<string, unknown>) => Promise<unknown> },
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    await ref.update(data);
    return true;
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    if (code === 5 || code === 'not-found') {
      console.info('[onReviewCreate] the review was deleted before it could be resolved; nothing recreated');
      return false;
    }
    throw err;
  }
}

export const onReviewCreate = onDocumentCreated('reviews/{reviewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  // A client cannot set `published` itself — firestore.rules rejects a create
  // carrying `published` or `visibleAt` — so this trigger is the only writer,
  // and it has exactly one answer.
  const review = snap.data() as { projectId?: string; professionalId?: string } | undefined;
  let held = false;
  if (review?.projectId && review.professionalId) {
    try {
      const fee = (await feeRef(review.projectId, review.professionalId).get()).data() as FeeDoc | undefined;
      held = isDidntHappenDispute(fee);
    } catch (err) {
      // Fail OPEN: a review is published by default, and this one error must not
      // leave a review stuck unpublished. Logged so a missed hold is findable.
      console.error('[onReviewCreate] dispute check failed, publishing', review.projectId, err);
    }
  }
  await updateIfExists(
    snap.ref,
    held ? { published: false, heldForDispute: true } : { published: true, visibleAt: FieldValue.serverTimestamp() },
  );
});
