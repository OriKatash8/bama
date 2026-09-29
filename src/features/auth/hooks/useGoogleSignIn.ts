import { useState } from 'react';
import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  getAdditionalUserInfo,
  signInWithCredential,
  signInWithPopup,
  type UserCredential,
} from 'firebase/auth';
import { useRouter } from 'expo-router';
import { auth, googleProvider } from '@core/firebase/config';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import i18n from '@core/i18n';
import { syncUser } from '@features/auth/utils/syncUser';
import { usePendingSignupStore } from '@features/auth/stores/pendingSignupStore';
import { recordConsent } from '@features/auth/utils/consent';

const IOS_CLIENT_ID =
  '165833515213-ukgt1joohvdo27n9lt9cr5anmediqq6r.apps.googleusercontent.com';

// Get this from Firebase Console → Authentication → Sign-in method → Google → Web SDK configuration → Web client ID
const WEB_CLIENT_ID =
  '165833515213-ne79l7lafiupu1gdvsubh6pjl7eogr7p.apps.googleusercontent.com';

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');
let googleSigninModule: GoogleSigninModule | null = null;

/**
 * The native module, loaded and configured on first use rather than at import.
 * With GOOGLE_SIGNIN_ENABLED off, its native code is not linked into the build
 * (react-native.config.js), and importing it at module load would crash the
 * app at launch just because this file is imported.
 */
function googleSignin(): GoogleSigninModule {
  if (!googleSigninModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    googleSigninModule = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
    googleSigninModule.GoogleSignin.configure({ iosClientId: IOS_CLIENT_ID, webClientId: WEB_CLIENT_ID });
  }
  return googleSigninModule;
}

type GoogleSignInState = {
  /** `consented`: both boxes were ticked where the button was tapped (register). */
  signInWithGoogle: (opts?: { consented?: boolean }) => Promise<void>;
  isLoading: boolean;
  error: string | null;
};

export function useGoogleSignIn(): GoogleSignInState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser } = useAuthStore();
  const { showToast } = useUiStore();
  const router = useRouter();

  /**
   * A NEW account goes to the consent screen with nothing written; consent is
   * recorded there, only once both boxes are checked. An existing account
   * signs in as before, and its consent is never touched here.
   */
  async function finish(
    result: UserCredential,
    info: { email: string; displayName: string; photoURL: string | null },
    consented: boolean,
  ) {
    // Both boxes already ticked on the register screen: that IS the consent.
    if (consented) {
      await recordConsent(result.user.uid);
      await syncUser(result.user.uid, info, setUser, undefined, {
      newAccount: getAdditionalUserInfo(result)?.isNewUser === true,
    });
      router.replace('/(auth)/mode-select');
      return;
    }
    if (getAdditionalUserInfo(result)?.isNewUser) {
      usePendingSignupStore.getState().setPending({ uid: result.user.uid, ...info });
      router.replace('/(auth)/consent' as never);
      return;
    }
    await syncUser(result.user.uid, info, setUser);
    router.replace('/(auth)/mode-select');
  }

  async function signInWithGoogle(opts?: { consented?: boolean }) {
    setIsLoading(true);
    setError(null);
    const consented = opts?.consented === true;
    try {
      if (Platform.OS === 'web') {
        await signInWithWeb(consented);
      } else {
        await signInWithNative(consented);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function signInWithWeb(consented: boolean) {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await finish(result, {
        email: result.user.email ?? '',
        displayName: result.user.displayName ?? '',
        photoURL: result.user.photoURL,
      }, consented);
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        // user dismissed — no error shown
      } else if (code === 'auth/account-exists-with-different-credential') {
        const msg = i18n.t('auth.err_google_email_exists');
        setError(msg);
        showToast(msg, 'error');
      } else {
        const msg = i18n.t('auth.err_google_failed');
        setError(msg);
        showToast(msg, 'error');
      }
    }
  }

  async function signInWithNative(consented: boolean) {
    const { GoogleSignin, statusCodes } = googleSignin();
    try {
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) throw new Error('No idToken returned from Google Sign-In');

      const googleUser = signInResult.data?.user;
      const googleName = googleUser?.name ||
        [googleUser?.givenName, googleUser?.familyName].filter(Boolean).join(' ') ||
        '';

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);

      await finish(result, {
        email: result.user.email || googleUser?.email || '',
        displayName: result.user.displayName || googleName,
        photoURL: result.user.photoURL || googleUser?.photo || null,
      }, consented);
    } catch (error: any) {
      console.log('[GoogleSignIn] full error:', JSON.stringify(error));
      console.log('[GoogleSignIn] error code:', error.code);
      console.log('[GoogleSignIn] error message:', error.message);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      const msg = i18n.t('auth.err_google_failed');
      setError(msg);
      showToast(msg, 'error');
    }
  }

  return { signInWithGoogle, isLoading, error };
}
