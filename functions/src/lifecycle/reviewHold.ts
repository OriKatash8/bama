import { db, FieldValue } from './helpers';

/**
 * The ONE sanctioned hold on a review: a client's review of a professional whose
 * engagement is disputed as "didn't happen".
 *
 * Reviews are otherwise never held (reviews.ts, firestore.rules). The old hold was
 * a lever on a payment and was removed on purpose; this one is tied to a dispute
 * about whether the work happened at all, and is undone when an admin resolves it:
 *   resolveFeeDispute 'completed' → the review is published,
 *   resolveFeeDispute 'cancelled' → the review is deleted.
 * An amount dispute (`fee_disputed`) never holds anything.
 *
 * `heldForDispute` marks these reviews so the two backstops that publish anything
 * still unpublished (publishProReview, the 60-day sweep) leave them alone.
 *
 * Only client→pro reviews exist; `pro_to_client` is a type nothing writes, so there
 * is no professional's review of the client to hold.
 *
 * Reads and writes are by projectId + professionalId, not by document id, so
 * reviews written before the deterministic `${projectId}_${professionalId}` id are
 * covered too.
 */
const reviewsFor = (projectId: string, proId: string) =>
  db.collection('reviews').where('projectId', '==', projectId).where('professionalId', '==', proId).get();

/** Is this fee disputed as "it never happened"? */
export function isDidntHappenDispute(
  fee: { engagementStatus?: string; adminReview?: { reason?: string } } | undefined,
): boolean {
  return fee?.engagementStatus === 'disputed' && fee.adminReview?.reason === 'didnt_happen';
}

/** Hide the existing review of this pro on this project until the dispute resolves. */
export async function holdReviewsForDispute(projectId: string, proId: string): Promise<number> {
  const snap = await reviewsFor(projectId, proId);
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { published: false, heldForDispute: true }));
  await batch.commit();
  return snap.size;
}

/**
 * Settle the held review(s) when the dispute is resolved. Acts ONLY on reviews that
 * were held for a dispute, so it is a no-op for an amount dispute.
 */
export async function settleHeldReviews(
  projectId: string, proId: string, outcome: 'completed' | 'cancelled',
): Promise<number> {
  const snap = await reviewsFor(projectId, proId);
  const held = snap.docs.filter((d) => d.get('heldForDispute') === true);
  if (held.length === 0) return 0;
  const batch = db.batch();
  held.forEach((d) => {
    if (outcome === 'completed') {
      batch.update(d.ref, {
        published: true, visibleAt: FieldValue.serverTimestamp(), heldForDispute: FieldValue.delete(),
      });
    } else {
      batch.delete(d.ref);
    }
  });
  await batch.commit();
  return held.length;
}
