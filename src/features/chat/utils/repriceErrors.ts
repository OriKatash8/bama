/**
 * Translation key for a failed price-change call, from the callable's message.
 *
 * createPaymentRequest and respondToPaymentRequest refuse for distinct,
 * actionable reasons; a bare catch collapsed them into one generic alert.
 * Unrecognised failures keep the generic text for their phase.
 */
export function repriceErrorKey(err: unknown, phase: 'create' | 'respond'): string {
  const msg = String((err as { message?: string })?.message ?? '');
  if (msg.includes('offer-price-out-of-range')) {
    return phase === 'create' ? 'project_details.reprice_out_of_range' : 'chats_page.hire_price_invalid';
  }
  // Both phases: create refuses to raise one, respond refuses to accept one.
  if (msg.includes('engagement-finished')) return 'project_details.reprice_engagement_finished';
  if (phase === 'create') {
    if (msg.includes('price-change-pending')) return 'project_details.reprice_pending';
    if (msg.includes('counter-not-allowed')) return 'project_details.reprice_counter_not_allowed';
    if (msg.includes('no-accepted-offer-to-reprice') || msg.includes('no-accepted-bundle-to-reprice')) {
      return 'project_details.reprice_no_offer';
    }
    if (msg.includes('professional-not-on-project') || msg.includes('not-a-party')) {
      return 'project_details.reprice_not_a_party';
    }
    return 'project_details.error_payment_request';
  }
  return 'project_details.error_accept_reject';
}
