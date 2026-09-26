import { Platform } from 'react-native';
import type { FirebaseApp } from 'firebase/app';

/**
 * App Check, bridged from the NATIVE SDK into the Firebase JS SDK.
 *
 * WHY A BRIDGE. The JS SDK ships three App Check providers: ReCaptchaV3,
 * ReCaptchaEnterprise and CustomProvider. Both reCAPTCHA providers need a
 * browser DOM — they inject a script and call `grecaptcha` — so neither works in
 * React Native (firebase-js-sdk#7060). App Attest and Play Integrity exist only
 * in the native SDKs. So the native module mints the token and CustomProvider
 * hands it to the JS SDK, which is what actually talks to Firestore and Storage.
 *
 * FAILURE IS NON-FATAL, DELIBERATELY. Every path here is wrapped: if the native
 * module is missing, attestation fails, or the device is offline, the app keeps
 * working and its requests simply go out unverified. That is the correct
 * trade-off while App Check is in MONITORING mode, where unverified requests are
 * counted and allowed. It stops being correct the moment you enforce — at that
 * point a silent failure here becomes a silent outage, so read the verified-%
 * in the console before flipping enforcement on any product.
 *
 * WEB IS SKIPPED. @react-native-firebase has no web build. Web is a dev-only
 * surface for BAMA (localhost:8081); if a real web build ever ships, it wants
 * ReCaptchaEnterpriseProvider here instead, plus its own registration.
 */

/**
 * The JS SDK's CustomProvider requires an expiry alongside the token; the native
 * getToken returns only the token. It is a JWT, so the expiry is in its `exp`
 * claim. Anything unexpected falls back to a conservative 30 minutes — shorter
 * than the 1-hour TTL configured in the console, so a fallback refreshes early
 * rather than serving something already expired.
 */
function expiryOf(token: string): number {
  const fallback = Date.now() + 30 * 60 * 1000;
  try {
    const payload = token.split('.')[1];
    if (!payload || typeof atob !== 'function') return fallback;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : fallback;
  } catch {
    return fallback;
  }
}

export async function initAppCheck(app: FirebaseApp): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    // require(), not import: a top-level import of @react-native-firebase would
    // be evaluated on web too, where it throws. This keeps it behind the guard.
    const { getApp: getNativeApp } = require('@react-native-firebase/app');
    const {
      initializeAppCheck: initNativeAppCheck,
      ReactNativeFirebaseAppCheckProvider,
    } = require('@react-native-firebase/app-check');
    const { initializeAppCheck, CustomProvider } = require('firebase/app-check');
    /* eslint-enable @typescript-eslint/no-require-imports */

    /**
     * Development only. App Attest will not attest an unsigned dev build, so in
     * __DEV__ the native SDK uses the debug provider and exchanges this token
     * for a real App Check token.
     *
     * IT IS A CREDENTIAL: anything presenting it passes App Check verification
     * for this project. So it lives in .env (gitignored), never in the repo, and
     * is read ONLY under __DEV__ — process.env.EXPO_PUBLIC_* values are inlined
     * at build time, so referencing it unconditionally would bake it into
     * release binaries too. Rotate it in the console if it ever leaks.
     */
    const debugToken = __DEV__
      ? process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN
      : undefined;

    if (__DEV__ && !debugToken) {
      console.warn(
        '[appCheck] no EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN — dev traffic will stay unverified',
      );
    }

    const nativeProvider = new ReactNativeFirebaseAppCheckProvider();
    nativeProvider.configure({
      // 'debug' in development: App Attest only attests real, signed builds, so a
      // simulator or a dev client cannot produce a real token. The debug provider
      // prints a token to the native log on first run — register it under
      // App Check → Apps → ⋮ → Manage debug tokens if you want dev traffic to
      // count as verified. Without that it stays unverified, which is harmless
      // in monitoring mode.
      apple: {
        provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
        ...(debugToken ? { debugToken } : {}),
      },
      // Android is registered but NOT configured in the console yet — Play
      // Integrity needs a Play-signed build. This line is ready for that day.
      android: {
        provider: __DEV__ ? 'debug' : 'playIntegrity',
        ...(debugToken ? { debugToken } : {}),
      },
    });

    const native = await initNativeAppCheck(getNativeApp(), {
      provider: nativeProvider,
      isTokenAutoRefreshEnabled: true,
    });

    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          // false: use the cached token until it expires. Passing true forces a
          // fresh attestation on every call, which on iOS is a real cryptographic
          // operation against Apple's servers — needlessly slow and rate-limited.
          const { token } = await native.getToken(false);
          return { token, expireTimeMillis: expiryOf(token) };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });

    console.log('[appCheck] initialized');
  } catch (e: any) {
    // Never rethrow — see the note at the top on why this is non-fatal.
    console.warn('[appCheck] not initialized:', e?.message ?? e);
  }
}
