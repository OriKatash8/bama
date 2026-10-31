import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { serverTimestamp } from 'firebase/firestore';
import { setDocument } from '@core/firebase/firestore';

/**
 * "1.0.0 (43)": the store version and the build number. Web, and a dev client
 * without a native build number, have neither, so this degrades to what exists.
 */
export function appVersionString(): string {
  const version = Application.nativeApplicationVersion ?? 'unknown';
  const build = Application.nativeBuildVersion;
  return build ? `${version} (${build})` : version;
}

/** Where the launch stamp lives: private to the owner and admins (see firestore.rules). */
export const presencePath = (uid: string) => `users/${uid}/private/presence`;

/**
 * Stamps users/{uid}/private/presence with where and when the app was last
 * opened: which platform, which version, and the server time. Called once per
 * launch with a signed-in user (useAuth), so support can tell which build a
 * person is on.
 *
 * NOT on users/{uid}: that document is readable by every signed-in user, and
 * nobody else should see when someone was last online or which device they use.
 * The whole doc is rewritten each launch (exactly these three keys, which is
 * what the rules require).
 *
 * Fire-and-forget: a failure is logged and swallowed, never blocking sign-in.
 */
export async function recordLaunch(uid: string): Promise<void> {
  try {
    await setDocument(presencePath(uid), {
      lastPlatform: Platform.OS,
      appVersion: appVersionString(),
      lastSeenAt: serverTimestamp(),
    });
  } catch (e) {
    console.log('[launch] not recorded:', e);
  }
}
