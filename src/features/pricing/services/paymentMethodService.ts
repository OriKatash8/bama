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
