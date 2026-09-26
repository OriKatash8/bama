import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
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
export const googleProvider = new GoogleAuthProvider();
export const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export const storage = getStorage(app);
export const rtdb = firebaseConfig.databaseURL ? getDatabase(app) : null;
export const functions = getFunctions(app);
