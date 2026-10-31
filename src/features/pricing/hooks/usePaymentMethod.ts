import { useCallback, useEffect, useState } from 'react';
import { getMyPaymentMethod, type PaymentMethodView } from '../services/paymentMethodService';

const DISABLED: PaymentMethodView = { enabled: false, hasCard: false };

/**
 * The signed-in professional's card state, or null while unknown.
 *
 * FAILS CLOSED: a failed call resolves to `{ enabled: false }`, so a network error
 * or a not-yet-deployed function hides the card UI rather than showing a broken
 * one. The failure is logged, not swallowed.
 */
export function usePaymentMethod(uid: string | undefined) {
  const [view, setView] = useState<PaymentMethodView | null>(null);

  const refresh = useCallback(async () => {
    if (!uid) return;
    try {
      setView(await getMyPaymentMethod({}));
    } catch (err) {
      console.error('[paymentMethod] load failed:', err);
      setView(DISABLED);
    }
  }, [uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Signed out: nothing to show, and no call was made.
  return { view: uid ? view : DISABLED, refresh };
}
