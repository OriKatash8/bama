import { useState } from 'react';
import { useRouter } from 'expo-router';
import { signOut } from '@core/firebase/auth';
import { useUiStore } from '@core/stores/uiStore';

export function useLogout() {
  const [isLoading, setIsLoading] = useState(false);
  const showToast = useUiStore((s) => s.showToast);
  const router = useRouter();

  async function logout() {
    setIsLoading(true);
    try {
      await signOut();
      router.replace('/(auth)');
    } catch {
      showToast('Failed to sign out. Please try again.', 'error');
      setIsLoading(false);
    }
  }

  return { isLoading, logout };
}
