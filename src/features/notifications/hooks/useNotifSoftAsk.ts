import { useCallback, useState } from 'react';
import { getNotificationPermissionState } from '@core/notifications/registerForPushNotifications';
import type { SoftAskContext } from '../components/NotifSoftAskModal';

/**
 * Gate for the pre-permission explanation.
 *
 * `ask()` is called from a moment of intent — an offer sent, a project published —
 * and opens the modal ONLY when the OS prompt has never been shown
 * (`status === 'undetermined'`).
 *
 * Granted: nothing to do. Denied: also nothing here — re-requesting is a no-op on
 * iOS once the dialog is spent, and recovery is the banner's job. Silently doing
 * nothing in both cases is deliberate: this must never interrupt a success flow.
 */
export function useNotifSoftAsk(): {
  context: SoftAskContext | null;
  ask: (context: SoftAskContext) => void;
  close: () => void;
} {
  const [context, setContext] = useState<SoftAskContext | null>(null);

  const ask = useCallback((next: SoftAskContext) => {
    void (async () => {
      const state = await getNotificationPermissionState();
      if (state.status !== 'undetermined') return;
      setContext(next);
    })();
  }, []);

  const close = useCallback(() => setContext(null), []);

  return { context, ask, close };
}
