import { confirmDialog } from '@utils/confirmDialog';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The message a professional sees when they try to send an offer while a fee is
 * overdue. Through confirmDialog, never Alert.alert directly — Alert.alert
 * silently no-ops on web.
 *
 * Confirm opens the fee terms; cancel just closes. Resolves once it is dismissed.
 */
export async function showFeeOverdueDialog(
  language: 'he' | 'en',
  amount: number,
  onTerms: () => void,
): Promise<void> {
  const nb = (language === 'he' ? he : en).noticeboard;
  const ok = await confirmDialog(
    nb.overdue_dialog_title,
    nb.overdue_dialog_body.replace('{{amount}}', amount.toLocaleString()),
    { confirm: nb.overdue_dialog_terms, cancel: nb.overdue_dialog_close, destructive: false },
  );
  if (ok) onTerms();
}

/** Is this the rules refusal an overdue professional's offer create gets? */
export function isPermissionDenied(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'permission-denied';
}
