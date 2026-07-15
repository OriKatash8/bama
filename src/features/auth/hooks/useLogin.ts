import { useState } from 'react';
import { useRouter } from 'expo-router';
import { signIn } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';
import i18n from '@core/i18n';

type LoginState = {
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
};

export function useLogin(): LoginState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useUiStore((s) => s.showToast);
  const router = useRouter();

  async function login(email: string, password: string) {
    setError(null);
    setIsLoading(true);
    try {
      await signIn(email, password);
      router.replace('/(auth)/mode-select');
    } catch (e: any) {
      const msg = toLoginError(e.code);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, error, login };
}

function toLoginError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return i18n.t('auth.err_invalid_credentials');
    case 'auth/too-many-requests':
      return i18n.t('auth.err_too_many');
    default:
      return i18n.t('auth.err_generic');
  }
}
