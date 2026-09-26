import { useState } from 'react';
import { useRouter } from 'expo-router';
import { signUp } from '@core/firebase/auth';
import { setDocument } from '@core/firebase/firestore';
import { savePhone } from '@features/auth/services/phoneService';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import i18n from '@core/i18n';

type TermsConsent = { acceptedAt: number; version: string; ageConfirmedAt: number };

type RegisterState = {
  isLoading: boolean;
  error: string | null;
  /** `phone` is already E.164 (normalizePhone). */
  register: (fullName: string, email: string, password: string, terms: TermsConsent, phone: string) => Promise<void>;
};

export function useRegister(): RegisterState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setUser } = useAuthStore();
  const { showToast } = useUiStore();

  async function register(fullName: string, email: string, password: string, terms: TermsConsent, phone: string) {
    setError(null);
    setIsLoading(true);
    try {
      const firebaseUser = await signUp(email, password);
      const userData = {
        id: firebaseUser.uid,
        email,
        displayName: fullName,
        photoURL: null,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        termsAcceptedAt: terms.acceptedAt,
        termsVersion: terms.version,
        ageConfirmed: true,
        ageConfirmedAt: terms.ageConfirmedAt,
      };
      await setDocument(`users/${firebaseUser.uid}`, userData);
      // Private, in its own owner-only doc: users/{uid} is readable by everyone.
      await savePhone(firebaseUser.uid, phone);
      setUser(userData);
      router.replace('/(auth)/mode-select');
    } catch (e: any) {
      const msg = toRegisterError(e.code);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, error, register };
}

function toRegisterError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return i18n.t('auth.err_email_exists');
    case 'auth/invalid-email':
      return i18n.t('auth.err_email_invalid');
    default:
      return i18n.t('auth.err_generic');
  }
}
