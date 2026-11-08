import { callFunction } from '@core/firebase/functions';

/**
 * The saved card used to charge the brokerage fee ("עמלת תיווך"). The card itself
 * lives with the payment provider and its token only ever on the server
 * (`paymentMethods/{uid}`, no client access): everything here goes through
 * europe-west1 callables, and the server never sends the token back.
 */
export type PaymentMethodView = {
  /** Server-computed per user: provider on AND this user allowed. The card UI
   *  renders only when this is true; never infer it from config on the client. */
  enabled: boolean;
  hasCard: boolean;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
  status?: 'active' | 'invalid';
  /** True when fees are paid on a hosted payment link instead of a saved card. The
   *  card UI stays hidden (`enabled` is false); the fee rows carry the pay button. */
  linkMode?: true;
};

const REGION = 'europe-west1' as const;

export const getMyPaymentMethod = callFunction<Record<string, never>, PaymentMethodView>(
  'getMyPaymentMethod', REGION,
);
export const createCardSaveSession = callFunction<
  Record<string, never>, { url: string; sessionId: string }
>('createCardSaveSession', REGION);
export const removeMyPaymentMethod = callFunction<Record<string, never>, { ok: boolean }>(
  'removeMyPaymentMethod', REGION,
);
/** Test provider only: the server refuses it unless the fake provider is active for you. */
export const fakeCompleteCardSave = callFunction<{ token?: string }, { ok: boolean }>(
  'fakeCompleteCardSave', REGION,
);

/** "Pay now": what the server answers when a professional asks for his fee's link. */
export type PayNowResult =
  | { status: 'ready'; url: string }
  /** Another request is creating the link; the fee row flips to Pay now when done. */
  | { status: 'pending' }
  | { status: 'needs_phone' }
  | { status: 'unavailable' };

/** Runs the same transactional link claim as the cron, so a fee still has ONE link. */
export const requestMyPaymentLinkNow = callFunction<{ projectId: string }, PayNowResult>(
  'requestMyPaymentLinkNow', REGION,
);
