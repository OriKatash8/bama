/**
 * MIRROR of functions/src/lifecycle/priceRequestPolicy.ts — the rule the server
 * enforces in createPaymentRequest. The professional's card uses it to enable
 * שינוי מחיר only when the server would accept the request, so the button never
 * taps into `counter-not-allowed`. A parity test runs both on the same cases
 * (src/features/chat/utils/__tests__/priceRequestPolicyParity.test.ts); change
 * them together.
 */

export type PriceRequestHistoryItem = { fromClient: boolean; status: string; createdAtMs: number };
export type PriceRequestDecision =
  | { allowed: true }
  | { allowed: false; reason: 'price-change-pending' | 'counter-not-allowed' };

export function roleKeyOf(req: { bundleId?: unknown; category?: unknown }): string {
  if (typeof req.bundleId === 'string' && req.bundleId) return `bundle:${req.bundleId}`;
  if (typeof req.category === 'string' && req.category) return `category:${req.category}`;
  return 'legacy';
}

export function sameRole(a: string, b: string): boolean {
  return a === 'legacy' || b === 'legacy' || a === b;
}

export function decideNewPriceRequest(args: {
  callerIsClient: boolean;
  underReview: boolean;
  proAccepted: boolean;
  history: readonly PriceRequestHistoryItem[];
}): PriceRequestDecision {
  const history = [...args.history].sort((a, b) => a.createdAtMs - b.createdAtMs);
  if (history.some((r) => r.status === 'pending')) {
    return { allowed: false, reason: 'price-change-pending' };
  }
  if (args.callerIsClient || !args.underReview) return { allowed: true };
  if (!args.proAccepted && !history.some((r) => !r.fromClient)) return { allowed: true };
  let lastClient = -1;
  history.forEach((r, i) => { if (r.fromClient) lastClient = i; });
  if (lastClient === -1) return { allowed: false, reason: 'counter-not-allowed' };
  if (history[lastClient].status !== 'rejected') return { allowed: false, reason: 'counter-not-allowed' };
  const alreadyCountered = history.slice(lastClient + 1).some((r) => !r.fromClient);
  return alreadyCountered ? { allowed: false, reason: 'counter-not-allowed' } : { allowed: true };
}
