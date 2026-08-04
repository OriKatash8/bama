import { useState } from 'react';
import { Platform } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { useRouter } from 'expo-router';
import { auth, googleProvider } from '@core/firebase/config';
import { getDocument, setDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import i18n from '@core/i18n';
import type { User } from '@core/types/user';

const IOS_CLIENT_ID =
  '165833515213-vnjr63akeo6tlrpr2a3i0q2ua742nj8f.apps.googleusercontent.com';

if (Platform.OS !== 'web') {
  GoogleSignin.configure({ iosClientId: IOS_CLIENT_ID });
}

type GoogleSignInState = {
  signInWithGoogle: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
};

export function useGoogleSignIn(): GoogleSignInState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser } = useAuthStore();
  const { showToast } = useUiStore();
  const router = useRouter();

  async function signInWithGoogle() {
    setIsLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        await signInWithWeb();
      } else {
        await signInWithNative();
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function signInWithWeb() {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await syncUser(result.user.uid, {
        email: result.user.email ?? '',
        displayName: result.user.displayName ?? '',
        photoURL: result.user.photoURL,
      });
      router.replace('/(auth)/mode-select');
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

  async function signInWithNative() {
    try {
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) throw new Error('No idToken returned from Google Sign-In');

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);

      await syncUser(result.user.uid, {
        email: result.user.email ?? '',
        displayName: result.user.displayName ?? '',
        photoURL: result.user.photoURL,
      });
      router.replace('/(auth)/mode-select');
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled — no error shown
      } else {
        const msg = i18n.t('auth.err_google_failed');
        setError(msg);
        showToast(msg, 'error');
      }
    }
  }

  async function syncUser(
    uid: string,
    info: { email: string; displayName: string; photoURL: string | null },
  ) {
    const existing = await getDocument<User>(`users/${uid}`);
    if (!existing) {
      const userData: User = {
        id: uid,
        email: info.email,
        displayName: info.displayName,
        photoURL: info.photoURL,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };
      await setDocument(`users/${uid}`, userData);
      setUser(userData);
    } else {
      setUser(existing);
    }
  }

  return { signInWithGoogle, isLoading, error };
}
