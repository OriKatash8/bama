import { useState } from 'react';
import { useRouter } from 'expo-router';
import { signOut } from '@core/firebase/auth';
import { deleteDocument } from '@core/firebase/firestore';
import { getCachedPushToken } from '@core/notifications/registerForPushNotifications';
import { useUiStore } from '@core/stores/uiStore';

export function useLogout() {
  const [isLoading, setIsLoading] = useState(false);
  const showToast = useUiStore((s) => s.showToast);
  const router = useRouter();

  async function logout() {
    setIsLoading(true);
    try {
      // Release this device's push token BEFORE signing out — the rules only
      // allow the owner (still authed) to delete it. Null token (web/simulator)
      // is a clean no-op; a delete failure must not block logout.
      const token = getCachedPushToken();
      if (token) {
        try { await deleteDocument(`pushTokens/${token}`); } catch { /* non-blocking */ }
      }
      await signOut();
      router.replace('/(auth)');
    } catch {
      showToast('Failed to sign out. Please try again.', 'error');
      setIsLoading(false);
    }
  }

  return { isLoading, logout };
}
