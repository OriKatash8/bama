import type { ProjectFee } from '@core/types/project';

/**
 * Which plain-language line, if any, describes where the automatic charge of a fee
 * stands. A key under `balance.charge_state_*`; null = say nothing.
 *
 * Informational only: nothing in the app is gated on it. Callers show it only when
 * the card feature is enabled for this user, so an unused feature never talks about
 * charging.
 */
export type ChargeStateKey =
  | 'idle' | 'charging' | 'succeeded' | 'failed' | 'needs_card' | 'awaiting_payment' | 'needs_phone';

export function chargeStateKey(
  fee: Pick<ProjectFee, 'chargeState' | 'engagementStatus' | 'feePaid' | 'status'>,
): ChargeStateKey | null {
  // Only a completed, unsettled engagement has anything to charge; a disputed or
  // cancelled one is explained by its own note.
  if (fee.engagementStatus !== 'completed') return null;
  const state = fee.chargeState ?? 'idle';
  if (state === 'succeeded') return 'succeeded';
  if (fee.feePaid === true || fee.status === 'paid' || fee.status === 'not_owed') return null;
  return state;
}

/**
 * The address to pay this fee at, or null when there is nothing payable right now.
 *
 * Only while the server says the fee is awaiting payment AND the link is still the
 * right one: not superseded, and for exactly what is owed today. A link made for an
 * amount that has since changed must never be offered, whatever state says. The
 * address must be https; the server writes it, but the browser is opened on it.
 */
export function payLinkUrl(
  fee: Pick<ProjectFee, 'chargeState' | 'engagementStatus' | 'feePaid' | 'status' | 'paymentLink' | 'feeDue'>,
): string | null {
  if (chargeStateKey(fee) !== 'awaiting_payment') return null;
  const link = fee.paymentLink;
  if (!link || link.superseded === true || link.amount !== fee.feeDue) return null;
  return typeof link.url === 'string' && link.url.startsWith('https://') ? link.url : null;
}

/**
 * May this professional ask for his payment link RIGHT NOW, without waiting for the
 * contest window to end? ("Pay now" during the window.)
 *
 * Completed and owed (feeDue > 0), not paid, and not contested: a contested fee is in
 * front of an admin and gets no button until it is resolved. `needs_phone` is left to
 * the "add phone" prompt, and a fee with a live link is served by `payLinkUrl`
 * instead; this is the case where no usable link exists yet (or the old one went
 * stale), so tapping asks the server for one. The server runs the same guards, so
 * this only decides whether to offer the button.
 */
export function canPayEarly(
  fee: Pick<ProjectFee,
    'chargeState' | 'engagementStatus' | 'feePaid' | 'status' | 'feeStatus' | 'feeDue'
    | 'paymentLink' | 'adminReviewPending'>,
): boolean {
  if (fee.feeStatus !== undefined && fee.feeStatus !== 'owed') return false;
  if (fee.adminReviewPending === true) return false;
  if (!(typeof fee.feeDue === 'number' && fee.feeDue > 0)) return false;
  const key = chargeStateKey(fee);
  if (key !== 'idle' && key !== 'awaiting_payment') return false;
  return payLinkUrl(fee) === null;
}
