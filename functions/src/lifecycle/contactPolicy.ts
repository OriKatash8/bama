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

const APPLE_PRIVATE_RELAY = '@privaterelay.appleid.com';

/**
 * The email getContactPhone may share INSTEAD of a phone number, behind the same
 * gate (canRevealPhone). Only when there is no phone on file, the Auth record has
 * an email, it is verified, and it is not an Apple private-relay address — a
 * relay only forwards mail from senders Apple has registered for this app, so to
 * the other side it is no contact at all. Anything else: null, nothing shown.
 */
export function revealableEmail(args: {
  phone: string | null;
  email: string | null | undefined;
  emailVerified: boolean | undefined;
}): string | null {
  const { phone, email, emailVerified } = args;
  if (phone) return null;
  if (typeof email !== 'string' || !email.trim()) return null;
  if (emailVerified !== true) return null;
  if (email.trim().toLowerCase().endsWith(APPLE_PRIVATE_RELAY)) return null;
  return email.trim();
}

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
