import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm dialog.
 * On web: uses window.confirm (synchronous, works reliably in browsers).
 * On native: wraps Alert.alert in a Promise.
 * Returns true if the user confirmed, false if they cancelled.
 */
export function confirmDialog(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
