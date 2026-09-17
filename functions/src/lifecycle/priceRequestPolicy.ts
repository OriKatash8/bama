/**
 * Who may raise a price change, and when. Pure — createPaymentRequest supplies
 * the facts it read inside its transaction.
 *
 * ONE check, two rules that are really one invariant:
 *
 *  - At most ONE pending request per (professional, role), either direction.
 *    Two live proposals for the same role would contradict each other, and the
 *    client's רלוונטי lock keys on "anything pending".
 *  - While the role is under the client's review, the professional may only
 *    COUNTER: raise a request right after rejecting the client's, once per client
 *    proposal. He cannot open a negotiation on his own; the client decides
 *    whether there is one. After the role is confirmed, repricing is unrestricted
 *    again, as it always was.
 *
 * "Counter only after rejecting" already implies "the client's request is no
 * longer pending", which is why the pending check comes first and both live here.
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
  | { allowed: false; reason: 'price-change-pending' | 'counter-not-allowed' };

export function decideNewPriceRequest(args: {
  callerIsClient: boolean;
  /** This role's accepted offer/bundle is still `review: 'pending'`. */
  underReview: boolean;
  /** Every request for this (project, professional, role), any order. */
  history: readonly PriceRequestHistoryItem[];
}): PriceRequestDecision {
  const history = [...args.history].sort((a, b) => a.createdAtMs - b.createdAtMs);

  if (history.some((r) => r.status === 'pending')) {
    return { allowed: false, reason: 'price-change-pending' };
  }
  if (args.callerIsClient || !args.underReview) return { allowed: true };

  // Professional, under review: a counter to the client's latest proposal only.
  let lastClient = -1;
  history.forEach((r, i) => { if (r.fromClient) lastClient = i; });
  if (lastClient === -1) return { allowed: false, reason: 'counter-not-allowed' };
  if (history[lastClient].status !== 'rejected') return { allowed: false, reason: 'counter-not-allowed' };
  const alreadyCountered = history.slice(lastClient + 1).some((r) => !r.fromClient);
  return alreadyCountered ? { allowed: false, reason: 'counter-not-allowed' } : { allowed: true };
}
