import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, connectAuthEmulator, GoogleAuthProvider, type Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import i18n from '@core/i18n';
import { firebaseLanguageCode } from './languageCode';

/**
 * DEV ONLY, OPT-IN: `EXPO_PUBLIC_USE_EMULATORS=1 npx expo start --web --clear` points
 * Auth, Firestore and Functions at the local emulators (scripts/dev-invite-fixture.mjs
 * seeds them). It switches to a `demo-` project id and a fake key, so nothing can
 * reach production even by mistake; Storage and the Realtime Database have no
 * emulator here and are left unreachable. Set it on the command line, not in a
 * .env file. `EXPO_PUBLIC_EMULATOR_HOST` is the machine running them (default
 * 127.0.0.1; a phone needs the computer's LAN address).
 */
const USE_EMULATORS = __DEV__ && process.env.EXPO_PUBLIC_USE_EMULATORS === '1';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';

const firebaseConfig = USE_EMULATORS
  ? {
      apiKey: 'emulator-fake-key',
      authDomain: 'demo-bama.firebaseapp.com',
      projectId: 'demo-bama',
      storageBucket: 'demo-bama.appspot.com',
      messagingSenderId: '0',
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      databaseURL: undefined,
    }
  : {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
    };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Typed explicitly: the require() below is `any`, and without this annotation it
// widened the exported `auth` to `any` for the whole app.
function createAuth(): Auth {
  try {
    // getReactNativePersistence lives in @firebase/auth's react-native bundle
    // (resolved by Metro at runtime) but not in its default TS types.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getReactNativePersistence } = require('@firebase/auth');
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Auth already initialized (Fast Refresh / module re-import) — reuse it
    return getAuth(app);
  }
}

// App Check runs on the native SDK and is bridged in — see ./appCheck. Started
// fire-and-forget and never awaited: it must not delay or block sign-in, and a
// failure leaves requests unverified rather than broken. Harmless while App
// Check is in monitoring mode; re-read that file before enforcing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
void (require('./appCheck') as typeof import('./appCheck')).initAppCheck(app);

export const auth = createAuth();
// Firebase's own emails (verification, password reset) in the app's language:
// set now, then kept in step with i18next, which LanguageSync keeps in step
// with the in-app language switch.
auth.languageCode = firebaseLanguageCode(i18n.language);
i18n.on('languageChanged', (lng) => {
  auth.languageCode = firebaseLanguageCode(lng);
});
export { firebaseLanguageCode };
export const googleProvider = new GoogleAuthProvider();
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export const storage = getStorage(app);
export const rtdb = firebaseConfig.databaseURL ? getDatabase(app) : null;
export const functions = getFunctions(app);
// The community-invite callables are pinned to europe-west1; the rest of the
// backend is in the default region, so this is a second instance, not a swap.
export const functionsEU = getFunctions(app, 'europe-west1');

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
  connectFunctionsEmulator(functionsEU, EMULATOR_HOST, 5001);
  console.warn(`[firebase] EMULATORS ON (${EMULATOR_HOST}) — project demo-bama, not production.`);
}
