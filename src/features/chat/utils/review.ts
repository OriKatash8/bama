import type { BundleOffer, PriceOffer } from '@core/types/project';

/**
 * Is this professional still waiting on the client's רלוונטי / לא רלוונטי?
 *
 * MIRROR of isPendingReview in functions/src/lifecycle/review.ts — the server
 * uses the same rule to decide when a project may activate, and the two must
 * agree or the card would ask about someone the server has already stopped
 * waiting on.
 *
 * `status === 'accepted'` is required, not implied. Rejecting a candidate sets
 * their offers to 'removed' but leaves `review: 'pending'` on them; checking
 * `review` alone would keep a released professional on the card forever.
 * Absent `review` is not pending — offers accepted before the review card.
 */
export function isPendingReview(offer: Pick<PriceOffer | BundleOffer, 'status' | 'review'>): boolean {
  return offer.status === 'accepted' && offer.review === 'pending';
}
