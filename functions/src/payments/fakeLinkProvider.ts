import type { LinkProvider } from './types';

/**
 * Deterministic stand-in for Make + Grow. The link is a dead address and the
 * processId is derived from the request id, so a repeated request returns the
 * same link, as a deduping Make scenario would. A payment is simulated by POSTing
 * to paymentLinkConfirm (emulator probes) or calling the handler directly.
 * Reachable only where isPaymentsEnabledFor allows 'fake_link'.
 */
export const fakeLinkProvider: LinkProvider = {
  name: 'fake_link',
  async createPaymentLink(input) {
    const processId = `fakelink_${input.requestId}`;
    return { url: `https://fake-pay.invalid/pay?process=${processId}`, processId };
  },
};
