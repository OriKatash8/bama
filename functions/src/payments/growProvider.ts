import type { PaymentProvider } from './types';

/**
 * Grow (Meshulam) implementation. NOT IMPLEMENTED: nothing selects it until
 * `paymentProvider` is set to 'grow', and every method throws so a premature
 * switch fails loudly instead of silently not charging.
 *
 * Secrets it will need (declare with defineSecret in the SAME change that
 * implements it, never before: an unset secret breaks `firebase deploy`):
 *   GROW_PAGE_CODE        hosted-page code identifying BAMA's page
 *   GROW_USER_ID          Grow account user id
 *   GROW_API_KEY          if Grow's server-side API needs one
 *   GROW_WEBHOOK_SECRET   whatever Grow's callback verification needs
 *
 * Known Grow facts to honour: card entry only on Grow's hosted page; a token can
 * be saved without charging (credit cards only, not Bit / Apple Pay / Google Pay);
 * token charges are server-to-server only; a token expires after about 180
 * charges; on a final error (card expired / stolen) stop charging that token.
 */
const notImplemented = (): never => { throw new Error('growProvider: not implemented'); };

export const growProvider: PaymentProvider = {
  name: 'grow',
  createCardSaveSession: async () => notImplemented(),
  chargeToken: async () => notImplemented(),
  verifyAndParseWebhook: async () => notImplemented(),
  lookupCharge: async () => notImplemented(),
};
