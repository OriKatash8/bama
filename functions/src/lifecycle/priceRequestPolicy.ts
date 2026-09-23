/**
 * Who may raise a price change, and when. Pure — createPaymentRequest supplies
 * the facts it read inside its transaction.
 *
 * ONE check, two rules that are really one invariant:
 *
 *  - At most ONE pending request per (professional, role), either direction.
 *    Two live proposals for the same role would contradict each other, and the
 *    client's רלוונטי lock keys on "anything pending".
 *  - While the role is under the client's review, the professional gets ONE
 *    unprompted request for the role — unless he has already said רלוונטי
 *    (acknowledgeCandidacy). Beyond that he may only COUNTER: raise a request
 *    right after rejecting the client's, once per client proposal. After the
 *    client confirms the role, repricing is unrestricted again, as it always was.
 *
 *    The unprompted request is counted over the role's whole history, never
 *    reset: once he has raised any request of his own for this role, it is used.
 *
 * "Counter only after rejecting" already implies "the client's request is no
 * longer pending", which is why the pending check comes first and both live here.
 *
 * Above both of them sits a third, simpler rule: an engagement that has ENDED is
 * frozen. Once the professional has finished their part the agreed amount is
 * history — it is what the fee was priced from and what the review was earned on
 * — so neither side may move it any more, from either direction.
 */

export type RoleKey = string;

/**
 * A role, for repricing. A bundle is one price over several roles and is
 * repriced as one unit, so it is its own key. A request with neither field is a
 * legacy per-professional request and matches every role — the same widening
 * respondToPaymentRequest already applies to it.
 */
export function roleKeyOf(req: { bundleId?: unknown; category?: unknown }): RoleKey {
  if (typeof req.bundleId === 'string' && req.bundleId) return `bundle:${req.bundleId}`;
  if (typeof req.category === 'string' && req.category) return `category:${req.category}`;
  return 'legacy';
}

export function sameRole(a: RoleKey, b: RoleKey): boolean {
  return a === 'legacy' || b === 'legacy' || a === b;
}

export type PriceRequestHistoryItem = {
  fromClient: boolean;
  status: 'pending' | 'accepted' | 'rejected' | string;
  /** Ordering only. A request without a readable time sorts first. */
  createdAtMs: number;
};

export type PriceRequestDecision =
  | { allowed: true }
  | { allowed: false; reason: 'engagement-finished' | 'price-change-pending' | 'counter-not-allowed' };

/**
 * Engagement states in which the agreed amount may no longer move.
 *
 * 'disputed' is in here because a contest does not undo a completion — it only
 * puts the fee in front of a human before it is charged — so the amount that
 * human is looking at must not shift underneath them. 'withdrawn' and
 * 'cancelled' are unreachable from most repricing paths (a released
 * professional is off `professionalIds` entirely), but an engagement that ended
 * without delivering is no more repriceable than one that delivered.
 *
 * 'end_requested_by_pro' / '..._by_client' are deliberately NOT here: those are
 * the legacy two-step end, still awaiting an answer, and the engagement is open
 * until it gets one. A re-hire writes 'hired' again (hire.ts), so a professional
 * brought back after finishing may be repriced on the new engagement.
 */
const ENDED_ENGAGEMENT = new Set(['completed', 'disputed', 'withdrawn', 'cancelled']);

export function engagementPriceFrozen(engagementStatus?: string | null): boolean {
  return ENDED_ENGAGEMENT.has(engagementStatus ?? '');
}

export function decideNewPriceRequest(args: {
  callerIsClient: boolean;
  /** This engagement has ended — `engagementPriceFrozen` on its own status. */
  engagementFinished: boolean;
  /** This role's accepted offer/bundle is still `review: 'pending'`. */
  underReview: boolean;
  /** The professional has said רלוונטי on this role (offer `proAccepted`). From
   *  then on, until the client confirms, he may only counter. */
  proAccepted: boolean;
  /** Every request for this (project, professional, role), any order. */
  history: readonly PriceRequestHistoryItem[];
}): PriceRequestDecision {
  const history = [...args.history].sort((a, b) => a.createdAtMs - b.createdAtMs);

  // Ahead of the pending check, so that "he has finished" is what a caller is
  // told: it is the actionable fact, and a request still pending against a
  // finished engagement cannot be accepted either (respondToPaymentRequest
  // refuses on the same predicate).
  if (args.engagementFinished) {
    return { allowed: false, reason: 'engagement-finished' };
  }
  if (history.some((r) => r.status === 'pending')) {
    return { allowed: false, reason: 'price-change-pending' };
  }
  if (args.callerIsClient || !args.underReview) return { allowed: true };

  // Professional, under review. His one unprompted request: only before he has
  // acknowledged, and only if he has never raised one of his own for this role.
  if (!args.proAccepted && !history.some((r) => !r.fromClient)) return { allowed: true };

  // Otherwise a counter to the client's latest proposal only.
  let lastClient = -1;
  history.forEach((r, i) => { if (r.fromClient) lastClient = i; });
  if (lastClient === -1) return { allowed: false, reason: 'counter-not-allowed' };
  if (history[lastClient].status !== 'rejected') return { allowed: false, reason: 'counter-not-allowed' };
  const alreadyCountered = history.slice(lastClient + 1).some((r) => !r.fromClient);
  return alreadyCountered ? { allowed: false, reason: 'counter-not-allowed' } : { allowed: true };
}
