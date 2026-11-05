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
 * Grow's Create Payment Link needs a valid Israeli MOBILE number in the local form
 * (05XXXXXXXX). The app stores E.164 (+9725XXXXXXXX), but the same number also
 * arrives as 9725XXXXXXXX or already local, so all three are accepted. Landlines,
 * VoIP (+9727...) and foreign numbers return null: no link is made (needs_phone).
 */
export function israeliMobileLocal(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const intl = /^\+?9725(\d{8})$/.exec(s);
  if (intl) return `05${intl[1]}`;
  return /^05\d{8}$/.test(s) ? s : null;
}

/** Grow's cap on the payer name; cut conservatively. */
export const GROW_NAME_MAX = 50;
const FALLBACK_NAME = 'משתמש BAMA';

/**
 * A name Grow's fullName field accepts: at least two words, each at least two
 * characters, trimmed and single-spaced. A name that already qualifies is kept; a
 * single word becomes "<name> BAMA"; words under two characters are dropped first
 * (Grow rejects them), and a name with nothing usable left is "משתמש BAMA". Never
 * longer than GROW_NAME_MAX, cut on a word boundary.
 */
export function growFullName(raw: unknown): string {
  const chars = (w: string) => Array.from(w).length;
  const words = (typeof raw === 'string' ? raw : '').trim().split(/\s+/).filter(Boolean);
  const usable = words.filter((w) => chars(w) >= 2);
  let out: string[];
  if (words.length >= 2 && usable.length === words.length) out = words;
  else if (usable.length >= 2) out = usable;
  else if (usable.length === 1) out = [usable[0], 'BAMA'];
  else return FALLBACK_NAME;

  const kept: string[] = [];
  for (const w of out) {
    if ([...kept, w].join(' ').length > GROW_NAME_MAX) break;
    kept.push(w);
  }
  if (kept.length >= 2) return kept.join(' ');
  // A single word too long to sit beside another: shorten it and add the suffix.
  return `${Array.from(out[0]).slice(0, GROW_NAME_MAX - 5).join('')} BAMA`;
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
