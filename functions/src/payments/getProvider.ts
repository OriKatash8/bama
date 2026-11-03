import { fakeProvider } from './fakeProvider';
import { growProvider } from './growProvider';
import { isPaymentsEnabledFor, type PaymentsConfig } from './guard';
import { fakeLinkProvider } from './fakeLinkProvider';
import { growLinkProvider } from './growLinkProvider';
import { isLinkProviderName } from '../pricing';
import type { LinkProvider, PaymentProvider } from './types';

/**
 * The ONE place a provider is chosen. Null means "payments are off for this
 * professional": 'none', or 'fake' for anyone who is not a listed tester (outside
 * the emulator). Callers treat null exactly like 'none', today's stub path.
 */
export function getProvider(
  config: Pick<PaymentsConfig, 'paymentProvider' | 'paymentTestUids'>,
  fee: { professionalId: string },
  emulator?: boolean,
): PaymentProvider | null {
  if (isLinkProviderName(config.paymentProvider)) return null;
  if (!isPaymentsEnabledFor(config, fee.professionalId, emulator)) return null;
  return config.paymentProvider === 'grow' ? growProvider : fakeProvider;
}

/** The provider that interprets webhooks. Not per-fee, so no tester check here:
 *  the handlers act only on fees the claim already routed to this provider. */
export function getWebhookProvider(
  config: Pick<PaymentsConfig, 'paymentProvider'>,
): PaymentProvider | null {
  if (config.paymentProvider === 'grow') return growProvider;
  if (config.paymentProvider === 'fake') return fakeProvider;
  return null;
}

/**
 * The link-style counterpart of getProvider. Null when the configured provider is
 * not a link provider or this pro is outside the audience, so the token path and
 * the link path can never both act on one fee.
 */
export function getLinkProvider(
  config: Pick<PaymentsConfig, 'paymentProvider' | 'paymentTestUids'> &
    Partial<Pick<PaymentsConfig, 'paymentLinkAudience'>>,
  fee: { professionalId: string },
  emulator?: boolean,
): LinkProvider | null {
  if (!isLinkProviderName(config.paymentProvider)) return null;
  if (!isPaymentsEnabledFor(config, fee.professionalId, emulator)) return null;
  return config.paymentProvider === 'grow_link' ? growLinkProvider : fakeLinkProvider;
}
