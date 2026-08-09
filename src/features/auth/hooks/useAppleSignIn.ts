import { useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { OAuthProvider, signInWithCredential } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { auth } from '@core/firebase/config';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import i18n from '@core/i18n';
import { syncUser } from '@features/auth/utils/syncUser';

type AppleSignInState = {
  signInWithApple: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
};

export function useAppleSignIn(): AppleSignInState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setUser } = useAuthStore();
  const { showToast } = useUiStore();
  const router = useRouter();

  async function signInWithApple() {
    setIsLoading(true);
    setError(null);
    try {
      // Generate a cryptographically random nonce to prevent replay attacks.
      // Apple receives the SHA256 hash; Firebase receives the raw value.
      const rawNonce = Array.from(await Crypto.getRandomBytesAsync(16))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
        { encoding: Crypto.CryptoEncoding.HEX },
      );

      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!appleCredential.identityToken) {
        throw new Error('Apple Sign-In returned no identity token');
      }

      const firebaseCredential = new OAuthProvider('apple.com').credential({
        idToken: appleCredential.identityToken,
        rawNonce,
      });

      const result = await signInWithCredential(auth, firebaseCredential);

      // Apple only returns fullName and email on the FIRST authorization.
      // On subsequent logins both are null — syncUser falls back to the
      // existing Firestore document in that case.
      const givenName = appleCredential.fullName?.givenName ?? '';
      const familyName = appleCredential.fullName?.familyName ?? '';
      const displayName = [givenName, familyName].filter(Boolean).join(' ');

      await syncUser(result.user.uid, {
        email: appleCredential.email ?? result.user.email ?? '',
        displayName,
        photoURL: null,
      }, setUser);

      router.replace('/(auth)/mode-select');
    } catch (e: any) {
      console.log('[AppleSignIn] full error:', JSON.stringify(e));
      console.log('[AppleSignIn] code:', e?.code);
      console.log('[AppleSignIn] message:', e?.message);
      const code = (e as { code?: string }).code ?? '';
      if (code === 'ERR_REQUEST_CANCELED') return;
      const msg = i18n.t('auth.err_apple_failed');
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return { signInWithApple, isLoading, error };
}
