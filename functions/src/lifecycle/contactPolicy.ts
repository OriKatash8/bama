/**
 * When a phone number may be shared, for getContactPhone. Pure, so it is tested
 * without Firestore.
 *
 * Only between a project's client and one of its professionals, and only once
 * that professional's part has ENDED: `completed`, or `disputed` (a contest does
 * not undo a completion — see priceRequestPolicy). A professional who withdrew, or
 * a project cancelled before the work was done, reveals nothing; nor does anything
 * still open, including the legacy two-step end request awaiting an answer.
 */
const REVEALS = new Set(['completed', 'disputed']);

export function canRevealPhone(args: {
  callerId: string;
  targetId: string;
  clientId: string;
  /** The engagement that decides: the target's when the client asks, the caller's own when a pro asks. */
  proEngagementStatus: string | undefined;
}): boolean {
  const { callerId, targetId, clientId, proEngagementStatus } = args;
  if (callerId === targetId) return false;
  const clientAndPro = callerId === clientId || targetId === clientId;
  return clientAndPro && REVEALS.has(proEngagementStatus ?? '');
}
