import { db } from './helpers';
import { getVacantSlots } from '../matching';

/**
 * The client's review of a hired professional — shared by candidates.ts (the
 * decisions), completion.ts (the C6 log) and the activation rule.
 *
 * `review` lives on the ACCEPTED offer docs, written 'pending' by
 * hireProfessional and moved to 'confirmed' by confirmCandidate. See hire.ts
 * REVIEW_PENDING for why it is on the offer and not the project, chat or fee.
 */

export type ReviewableOffer = {
  status?: unknown;
  review?: unknown;
  professionalId?: unknown;
};

/**
 * THE one definition of "this offer is still under review".
 *
 * `status === 'accepted'` is half of it, not decoration. Rejecting a candidate
 * runs releaseEngagement, which sets their offers to 'removed' and leaves the
 * `review: 'pending'` it found — so a check on `review` alone would count a
 * professional who is no longer on the project as still awaiting a decision,
 * and the project could never activate. The client card applies the same rule
 * (src/features/chat/utils/review.ts).
 *
 * Absent `review` is not pending: offers accepted before the review card
 * existed carry no field.
 */
export function isPendingReview(offer: ReviewableOffer): boolean {
  return offer.status === 'accepted' && offer.review === 'pending';
}

type ActivationProject = {
  status?: unknown;
  crewSlots?: { category: string; quantity: number; requiredCapability?: string }[];
  filledSlots?: { category: string; requiredCapability?: string }[];
};

export type ActivationDecision = { activate: boolean; reason: string };

/**
 * Should the project move from 'open' to 'in_progress' now? Pure.
 *
 * All of:
 *  - it is 'open' — never reopens, completes or un-cancels anything, and makes
 *    a second call after activation a no-op;
 *  - no vacant seat (C3). The noticeboard lists only 'open' projects, so
 *    activating with a seat still empty would stop that seat getting bids;
 *  - somebody was actually hired — an empty crew has nothing to activate;
 *  - nobody is still under review, by isPendingReview, so a rejected
 *    professional's removed offer is ignored.
 *
 * `offers` should be every priceOffer AND bundleOffer on the project; anything
 * not accepted is ignored here rather than trusted to be pre-filtered.
 */
export function decideActivation(project: ActivationProject, offers: readonly ReviewableOffer[]): ActivationDecision {
  if (project.status !== 'open') return { activate: false, reason: `status is ${String(project.status)}` };
  const vacant = getVacantSlots({ crewSlots: project.crewSlots ?? [], filledSlots: project.filledSlots ?? [] });
  if (vacant.length > 0) return { activate: false, reason: `${vacant.length} vacant seat kind(s)` };
  const accepted = offers.filter((o) => o.status === 'accepted');
  if (accepted.length === 0) return { activate: false, reason: 'no crew' };
  const pending = accepted.filter(isPendingReview);
  if (pending.length > 0) return { activate: false, reason: `${pending.length} offer(s) under review` };
  return { activate: true, reason: 'crew confirmed and complete' };
}

/** Accepted priceOffers and bundleOffers on a project, optionally for one pro. */
export async function acceptedOffers(projectId: string, proId?: string) {
  const scoped = (col: string) => {
    let q = db.collection(col).where('projectId', '==', projectId);
    if (proId) q = q.where('professionalId', '==', proId);
    return q.where('status', '==', 'accepted').get();
  };
  const [price, bundle] = await Promise.all([scoped('priceOffers'), scoped('bundleOffers')]);
  return { price: price.docs, bundle: bundle.docs };
}

/** The accepted offer/bundle docs still under review for one professional. */
export async function pendingReviewOffers(projectId: string, proId: string) {
  const { price, bundle } = await acceptedOffers(projectId, proId);
  return [...price, ...bundle].filter((d) => isPendingReview(d.data()));
}

/**
 * C6 — observation only. An engagement that completes while the client never
 * decided on the professional is allowed (the professional is never blocked on
 * the client's review), but we want to know whether it ever happens.
 * Never throws: a logging read must not fail a completion.
 */
export async function warnIfCompletedUnderReview(projectId: string, proId: string): Promise<void> {
  try {
    const pending = await pendingReviewOffers(projectId, proId);
    if (pending.length > 0) {
      console.warn('[review] engagement completed while under review', { projectId, proId });
    }
  } catch (err) {
    console.error('[review] completed-under-review check failed', { projectId, proId, err });
  }
}
