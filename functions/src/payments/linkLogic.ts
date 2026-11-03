import { contestWindowEndsAt, type FeeDoc } from '../lifecycle/helpers';

/**
 * Pure rules for link mode. The runtime (link.ts) re-asks these inside the
 * transaction, which is what makes two racing sweeps create ONE link.
 */

/** A creation claim younger than this is presumed to still be running. Make is
 *  given 25s, so a live worker is long finished by then; only a crash leaves it. */
export const LINK_CLAIM_STALE_MS = 10 * 60_000;
/** Failed creations (Make down, bad reply) before a human is told. */
export const LINK_MAX_ATTEMPTS = 5;

export const feeKeyOf = (projectId: string, proId: string) => `${projectId}_${proId}`;

/** "projectId_proId" back to its parts; null when it is not exactly two ids.
 *  Firestore auto-ids contain no underscore, which is what makes this safe. */
export function parseFeeKey(key: unknown): { projectId: string; proId: string } | null {
  if (typeof key !== 'string') return null;
  const m = /^([^_]+)_([^_]+)$/.exec(key);
  return m ? { projectId: m[1], proId: m[2] } : null;
}

/**
 * Grow's Create Payment Link needs a valid Israeli MOBILE number. The app stores
 * E.164 (+9725XXXXXXXX for mobile); Grow wants the local form (05XXXXXXXX).
 * Landlines, VoIP (+9727...) and foreign numbers return null: no link is made.
 */
export function israeliMobileLocal(e164: unknown): string | null {
  if (typeof e164 !== 'string') return null;
  const m = /^\+9725(\d{8})$/.exec(e164);
  return m ? `05${m[1]}` : null;
}

const ms = (t: unknown): number | undefined =>
  t && typeof (t as { toMillis?: unknown }).toMillis === 'function'
    ? (t as { toMillis(): number }).toMillis()
    : undefined;

/** Is the fee's existing link still the right one to show and to accept payment on? */
export function isLinkLive(fee: Pick<FeeDoc, 'paymentLink' | 'feeDue'>): boolean {
  const l = fee.paymentLink;
  return !!l && l.superseded !== true && typeof fee.feeDue === 'number' && l.amount === fee.feeDue;
}

/** Fee state in which a link can no longer be paid: settled, voided or not owed. */
export function isFeeClosed(fee: FeeDoc): boolean {
  return fee.feeStatus !== 'owed' || fee.feePaid === true || fee.status === 'paid'
    || fee.status === 'not_owed' || !(typeof fee.feeDue === 'number' && fee.feeDue > 0);
}

export type LinkVerdict =
  | { ok: true; amount: number; attempt: number; replaces?: string }
  | { ok: false; reason: string };

/**
 * May a link be created for this fee right now? The same refusals as a card charge
 * (owed, completed, not contested, window closed, positive feeDue), then:
 *  - a live link already exists -> no (ONE link per fee; reminders reuse it)
 *  - a creation claim is still fresh -> no
 *  - creation has failed LINK_MAX_ATTEMPTS times -> no (a human has been told)
 * A stale link (feeDue moved on) is not a refusal: it is replaced, and `replaces`
 * names it so the caller supersedes it in the same transaction.
 */
export function evaluateLinkClaim(fee: FeeDoc | undefined, now: number): LinkVerdict {
  const no = (reason: string): LinkVerdict => ({ ok: false, reason });
  if (!fee) return no('no-fee');
  if (fee.feeStatus !== 'owed') return no('not-owed');
  if (fee.engagementStatus !== 'completed') return no('not-completed');
  if (fee.adminReviewPending === true) return no('under-review');
  if (fee.feePaid === true || fee.status === 'paid' || fee.status === 'not_owed') return no('settled');
  if (fee.chargeReview) return no('needs-human');

  const amount = fee.feeDue;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return no('nothing-due');

  const dueAt = ms(contestWindowEndsAt(fee));
  if (dueAt === undefined || now < dueAt) return no('window-open');

  const state = fee.chargeState ?? 'idle';
  if (state !== 'idle' && state !== 'needs_phone' && state !== 'awaiting_payment') return no(`state-${state}`);
  if (isLinkLive(fee)) return no('link-live');

  const claim = fee.paymentLinkClaim;
  const claimAt = ms(claim?.at);
  if (claimAt !== undefined && now - claimAt < LINK_CLAIM_STALE_MS) return no('claim-held');
  const attempts = claim?.attempts ?? 0;
  if (attempts >= LINK_MAX_ATTEMPTS) return no('attempts-spent');

  return {
    ok: true,
    amount,
    attempt: attempts + 1,
    replaces: fee.paymentLink && fee.paymentLink.superseded !== true ? fee.paymentLink.processId : undefined,
  };
}
