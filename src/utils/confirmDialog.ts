import { Alert, Platform } from 'react-native';

export type ConfirmLabels = {
  /** Affirmative button. Defaults to 'OK'. */
  confirm?: string;
  /** Dismissive button. Defaults to 'Cancel'. */
  cancel?: string;
  /** Whether the affirmative button is styled as destructive on iOS.
   *  Defaults to true, which is what every existing call site assumed. */
  destructive?: boolean;
};

/**
 * Cross-platform confirm dialog.
 * On web: uses window.confirm (synchronous, works reliably in browsers).
 * On native: wraps Alert.alert in a Promise.
 * Returns true if the user confirmed, false if they cancelled.
 *
 * `Alert.alert` silently no-ops on web, so nothing that needs an answer may call
 * it directly — that is what this exists for.
 *
 * Button labels are a parameter because they are USER-FACING TEXT in a
 * Hebrew-first app. They used to be hardcoded English, which is why two
 * components (NotifPermissionBanner, NotifSoftAskModal) route around this helper
 * with their own modals. Pass translated labels; the English defaults only keep
 * older call sites behaving exactly as before.
 *
 * Note web's `window.confirm` cannot be relabelled — the browser supplies its own
 * OK/Cancel. The labels apply on native only, which is the platform that shows
 * them.
 */
export function confirmDialog(
  title: string,
  message: string,
  labels: ConfirmLabels = {},
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }
  const { confirm = 'OK', cancel = 'Cancel', destructive = true } = labels;
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirm, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
