import { useCallback, useState } from 'react';
import { BAMA_CONTACT_EMAIL } from '@core/constants/contact';
import { useUiStore } from '@core/stores/uiStore';
import { openBamaMail } from './openBamaMail';

/**
 * A "request to join" button's behaviour: open the composer with `subject`; if that fails (no mail
 * account on the device, which is the App Review case), ALWAYS say so in a toast with BAMA's
 * address, and expose `failed` so the screen can also keep the address on screen, selectable
 * (a toast is gone in 3 s and cannot be selected). `failedMessage` contains `{{email}}`.
 */
export function useBamaMail(subject: string, failedMessage: string) {
  const [failed, setFailed] = useState(false);
  const open = useCallback(async () => {
    const ok = await openBamaMail(subject);
    if (ok) return;
    setFailed(true);
    useUiStore.getState().showToast(failedMessage.replace('{{email}}', BAMA_CONTACT_EMAIL), 'error');
  }, [subject, failedMessage]);
  return { open, failed, email: BAMA_CONTACT_EMAIL };
}
