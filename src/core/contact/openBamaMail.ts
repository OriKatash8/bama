import { Linking } from 'react-native';
import { BAMA_CONTACT_EMAIL } from '@core/constants/contact';

/** mailto: to BAMA with a prefilled subject (percent-encoded: the subjects are Hebrew). No body. */
export function bamaMailtoUrl(subject: string): string {
  return `mailto:${BAMA_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/**
 * Opens the mail composer. Resolves true when iOS/Android took the link, false when it did not:
 * `openURL` rejects when there is no mail app or account, and can also throw synchronously.
 * Never throws, so the caller can always show the address instead.
 */
export async function openBamaMail(subject: string): Promise<boolean> {
  try {
    await Linking.openURL(bamaMailtoUrl(subject));
    return true;
  } catch {
    return false;
  }
}
