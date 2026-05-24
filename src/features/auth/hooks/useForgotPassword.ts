import { useState } from 'react';
import { sendPasswordResetEmail } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';

type ForgotPasswordState = {
  isLoading: boolean;
  sent: boolean;
  error: string | null;
  sendReset: (email: string) => Promise<void>;
};

export function useForgotPassword(): ForgotPasswordState {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  async function sendReset(email: string) {
    setError(null);
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(email);
      setSent(true);
    } catch (e: any) {
      const msg =
        e.code === 'auth/user-not-found'
          ? 'No account found with this email.'
          : 'Something went wrong. Please try again.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, sent, error, sendReset };
}
