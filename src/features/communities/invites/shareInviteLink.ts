import { Platform, Share } from 'react-native';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unsupported';

type WebNavigator = {
  share?: (data: { title?: string; text?: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
};

/**
 * Hands the invite to the OS. No expo-clipboard (a native module), by decision:
 *  - native: the share sheet, which offers Copy itself;
 *  - web: the Web Share API where the browser has it, otherwise the async
 *    clipboard, in which case the caller says "copied" (a share sheet that
 *    silently did nothing would look broken).
 * `message` already contains the link, so only it is passed: sending `url` as
 * well makes iOS and some browsers paste the link twice.
 *
 * Returns what happened so the caller can toast; it throws only if the native
 * sheet itself fails.
 */
export async function shareInviteLink(p: { title: string; message: string; url: string }): Promise<ShareOutcome> {
  if (Platform.OS !== 'web') {
    const r = await Share.share({ message: p.message, title: p.title });
    return r.action === Share.dismissedAction ? 'cancelled' : 'shared';
  }
  const nav = (globalThis as { navigator?: WebNavigator }).navigator;
  if (nav?.share) {
    try {
      await nav.share({ title: p.title, text: p.message });
      return 'shared';
    } catch (e) {
      // Closing the sheet is not an error and must not fall through to a copy.
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(p.url);
      return 'copied';
    } catch {
      // Permission denied or no secure context.
    }
  }
  return 'unsupported';
}
