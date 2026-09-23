import { where } from 'firebase/firestore';
import { subscribeToCollection } from '@core/firebase/firestore';
import { callFunction } from '@core/firebase/functions';
import type { BundleOffer, PaymentRequest, PriceOffer } from '@core/types/project';
import { categoryLabel } from '@features/crew/data/categories';
import { isPendingReview } from '../utils/review';
import { decideNewPriceRequest, roleKeyOf, sameRole } from '../utils/priceRequestPolicy';

/**
 * Data for the client's review card and the professional's status chip.
 *
 * The review lives on the ACCEPTED offer docs (`review: 'pending' | 'confirmed'`),
 * written by hireProfessional and resolved by confirmCandidate / rejectCandidate.
 * Offer docs are readable by exactly the project client and that professional,
 * which is who these two surfaces are for.
 */

/** One repriceable unit: a single role, or a bundle (one price over several roles). */
export type ReviewRole = {
  key: string;
  label: string;
  amount: number;
  category?: string;
  bundleId?: string;
};

export type PendingCandidate = {
  proId: string;
  roles: ReviewRole[];
  total: number;
  /** The professional has said רלוונטי (acknowledgeCandidacy) on something still under review. */
  proAccepted: boolean;
};

type Lang = 'he' | 'en';

/**
 * The repriceable units among a professional's accepted offers.
 *
 * A bundle counts ONCE, at bundlePrice. Its component priceOffers are accepted
 * and flagged alongside it (they carry `bundleId`), so they are skipped here —
 * counting them too would show the bundle's roles twice and add their individual
 * prices on top of the bundle price.
 */
function rolesOf(offers: PriceOffer[], bundles: BundleOffer[], lang: Lang): ReviewRole[] {
  const bundleRoles = bundles.map((b) => ({
    key: `bundle:${b.id}`,
    label: (b.slots ?? []).map((s) => categoryLabel(s.category, lang)).join(' · '),
    amount: b.bundlePrice,
    bundleId: b.id,
  }));
  const offerRoles = offers
    .filter((o) => !o.bundleId)
    .map((o) => ({
      key: `category:${o.category}`,
      label: categoryLabel(o.category, lang),
      amount: o.price,
      category: o.category,
    }));
  return [...offerRoles, ...bundleRoles];
}

const sum = (roles: ReviewRole[]) => roles.reduce((n, r) => n + (Number(r.amount) || 0), 0);

/**
 * Professionals the client still has to decide on, one entry per professional.
 *
 * Filtered by isPendingReview — `status === 'accepted'` AND `review === 'pending'`.
 * A rejected candidate's offers become 'removed' but keep `review: 'pending'`;
 * they must not come back onto the card.
 */
export function groupPendingByPro(offers: PriceOffer[], bundles: BundleOffer[], lang: Lang): PendingCandidate[] {
  const pendingOffers = offers.filter(isPendingReview);
  const pendingBundles = bundles.filter(isPendingReview);
  const proIds = [...new Set([...pendingOffers, ...pendingBundles].map((o) => o.professionalId))];
  return proIds
    .map((proId) => {
      const roles = rolesOf(
        pendingOffers.filter((o) => o.professionalId === proId),
        pendingBundles.filter((b) => b.professionalId === proId),
        lang,
      );
      const mine = [...pendingOffers, ...pendingBundles].filter((o) => o.professionalId === proId);
      return { proId, roles, total: sum(roles), proAccepted: mine.some((o) => o.proAccepted === true) };
    })
    // A pro whose only pending offers are bundle components with no loaded bundle
    // has nothing actionable to show — the bundle doc is what carries the price.
    .filter((c) => c.roles.length > 0);
}

/**
 * A professional's own review state across their accepted offers on a project.
 * `null` when nothing carries a review — a hire from before the review card —
 * which means no chip at all.
 */
export function proReviewState(offers: PriceOffer[], bundles: BundleOffer[]): 'pending' | 'confirmed' | null {
  const accepted = [...offers, ...bundles].filter((o) => o.status === 'accepted');
  if (accepted.some(isPendingReview)) return 'pending';
  if (accepted.some((o) => o.review === 'confirmed')) return 'confirmed';
  return null;
}

/** A professional's own accepted roles and total, for the chip's price line. */
export function proPrice(offers: PriceOffer[], bundles: BundleOffer[], lang: Lang): { roles: ReviewRole[]; total: number } {
  const roles = rolesOf(
    offers.filter((o) => o.status === 'accepted'),
    bundles.filter((b) => b.status === 'accepted'),
    lang,
  );
  return { roles, total: sum(roles) };
}

/**
 * Live accepted offers and bundles on a project.
 *
 * `proId` null = the client's view (every professional). A professional MUST
 * pass their own id: the offer read rule admits them only to their own docs, and
 * a query that could return anyone else's is denied as a whole.
 */
export function listenToAcceptedOffers(
  projectId: string,
  proId: string | null,
  callback: (data: { offers: PriceOffer[]; bundles: BundleOffer[] }) => void,
): () => void {
  let offers: PriceOffer[] | null = null;
  let bundles: BundleOffer[] | null = null;
  const emit = () => { if (offers && bundles) callback({ offers, bundles }); };
  const scope = [
    where('projectId', '==', projectId),
    ...(proId ? [where('professionalId', '==', proId)] : []),
    where('status', '==', 'accepted'),
  ];
  const u1 = subscribeToCollection<PriceOffer>('priceOffers', (d) => { offers = d; emit(); }, ...scope);
  const u2 = subscribeToCollection<BundleOffer>('bundleOffers', (d) => { bundles = d; emit(); }, ...scope);
  return () => { u1(); u2(); };
}

const confirmCandidateFn = callFunction<
  { projectId: string; professionalId: string },
  { ok: boolean; confirmed: number; activated: boolean }
>('confirmCandidate');

const rejectCandidateFn = callFunction<
  { projectId: string; professionalId: string; reason?: string },
  { ok: boolean; dmSent: boolean; activated: boolean }
>('rejectCandidate');

/** רלוונטי. The server refuses while a price change for this professional is pending. */
export function confirmCandidate(projectId: string, professionalId: string) {
  return confirmCandidateFn({ projectId, professionalId });
}

/** לא רלוונטי. `reason`, when given, reaches the professional only as a private DM. */
export function rejectCandidate(projectId: string, professionalId: string, reason?: string) {
  return rejectCandidateFn({ projectId, professionalId, ...(reason ? { reason } : {}) });
}

const acknowledgeCandidacyFn = callFunction<{ projectId: string }, { ok: boolean; acknowledged: number }>('acknowledgeCandidacy');
const declineCandidacyFn = callFunction<{ projectId: string }, { ok: boolean; activated: boolean }>('declineCandidacy');

/** The professional's רלוונטי. Informational for the client; afterwards he may only counter. */
export function acknowledgeCandidacy(projectId: string) {
  return acknowledgeCandidacyFn({ projectId });
}

/** The professional's לא רלוונטי — leaves the project immediately while still under review. */
export function declineCandidacy(projectId: string) {
  return declineCandidacyFn({ projectId });
}

/** Has the professional said רלוונטי on anything still under review? */
export function proHasAcknowledged(offers: PriceOffer[], bundles: BundleOffer[]): boolean {
  return [...offers, ...bundles].some((o) => isPendingReview(o) && o.proAccepted === true);
}

/**
 * Every price change involving this professional on the project, ANY status —
 * the policy needs the history, not just what is pending. Two queries because the
 * read rule admits a request only to its `fromUserId` or `toUserId`.
 */
export function listenToMyPriceRequestHistory(
  projectId: string,
  proId: string,
  callback: (requests: PaymentRequest[]) => void,
): () => void {
  let from: PaymentRequest[] | null = null;
  let to: PaymentRequest[] | null = null;
  const emit = () => {
    if (!from || !to) return;
    const byId = new Map<string, PaymentRequest>();
    [...from, ...to].forEach((r) => byId.set(r.id, r));
    callback([...byId.values()]);
  };
  const path = `projects/${projectId}/paymentRequests`;
  const u1 = subscribeToCollection<PaymentRequest>(path, (d) => { from = d; emit(); }, where('fromUserId', '==', proId));
  const u2 = subscribeToCollection<PaymentRequest>(path, (d) => { to = d; emit(); }, where('toUserId', '==', proId));
  return () => { u1(); u2(); };
}

const millis = (ts: unknown): number =>
  typeof (ts as { toMillis?: () => number })?.toMillis === 'function' ? (ts as { toMillis: () => number }).toMillis() : 0;

/**
 * The professional's roles he may raise a price change on right now — the same
 * decision createPaymentRequest will make (via the client mirror of the policy).
 * Per role: under review and proAccepted come from that role's own offer/bundle.
 */
export function rolesProMayReprice(
  offers: PriceOffer[],
  bundles: BundleOffer[],
  history: PaymentRequest[],
  proId: string,
  lang: Lang,
): ReviewRole[] {
  const accepted = [
    ...bundles.filter((b) => b.status === 'accepted').map((b) => ({ key: `bundle:${b.id}`, doc: b as PriceOffer | BundleOffer })),
    ...offers.filter((o) => o.status === 'accepted' && !o.bundleId).map((o) => ({ key: `category:${o.category}`, doc: o as PriceOffer | BundleOffer })),
  ];
  const roles = rolesOf(offers.filter((o) => o.status === 'accepted'), bundles.filter((b) => b.status === 'accepted'), lang);
  return roles.filter((role) => {
    const doc = accepted.find((a) => a.key === role.key)?.doc;
    if (!doc) return false;
    const decision = decideNewPriceRequest({
      callerIsClient: false,
      // Never frozen here. This is the CANDIDATE REVIEW card: every offer it
      // reads is `review: 'pending'`, which is before the hire is confirmed and
      // therefore long before any engagement can finish. The screen that has to
      // care about a finished engagement is project-details.
      engagementFinished: false,
      underReview: isPendingReview(doc),
      proAccepted: doc.proAccepted === true,
      history: history
        .filter((r) => sameRole(role.key, roleKeyOf(r)))
        .map((r) => ({ fromClient: r.fromUserId !== proId, status: r.status, createdAtMs: millis(r.createdAt) })),
    });
    return decision.allowed;
  });
}

/** Translation key for a failed decision, from the callable's message. */
export function candidateErrorKey(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? '');
  if (msg.includes('price-change-pending')) return 'candidate_review.err_price_pending';
  if (msg.includes('not-under-review')) return 'candidate_review.err_not_under_review';
  if (msg.includes('engagement-not-open')) return 'candidate_review.err_engagement_not_open';
  return 'candidate_review.err_generic';
}
