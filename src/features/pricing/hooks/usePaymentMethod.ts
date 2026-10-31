import { useCallback, useEffect, useState } from 'react';
import { getMyPaymentMethod, type PaymentMethodView } from '../services/paymentMethodService';

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
    if (!uid) { setView({ enabled: false, hasCard: false }); return; }
    try {
      setView(await getMyPaymentMethod({}));
    } catch (err) {
      console.error('[paymentMethod] load failed:', err);
      setView({ enabled: false, hasCard: false });
    }
  }, [uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { view, refresh };
}
