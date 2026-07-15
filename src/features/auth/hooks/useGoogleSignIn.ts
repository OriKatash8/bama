import { useState } from 'react';
import { Platform, Alert } from 'react-native';
import { signInWithPopup } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { auth, googleProvider } from '@core/firebase/config';
import { getDocument, setDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import type { User } from '@core/types/user';

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
    if (Platform.OS !== 'web') {
      Alert.alert('Coming Soon', 'Google Sign-In on mobile coming soon');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;

      const existing = await getDocument<User>(`users/${fbUser.uid}`);
      if (!existing) {
        const userData: User = {
          id: fbUser.uid,
          email: fbUser.email ?? '',
          displayName: fbUser.displayName ?? '',
          photoURL: fbUser.photoURL,
          createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        };
        await setDocument(`users/${fbUser.uid}`, userData);
        setUser(userData);
      } else {
        setUser(existing);
      }

      router.replace('/(auth)/mode-select');
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        // user dismissed the popup — no error shown
      } else if (code === 'auth/account-exists-with-different-credential') {
        const msg = 'An account with this email already exists. Please sign in with your original method.';
        setError(msg);
        showToast(msg, 'error');
      } else {
        const msg = 'Google sign-in failed. Please try again.';
        setError(msg);
        showToast(msg, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return { signInWithGoogle, isLoading, error };
}
