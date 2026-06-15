import { useEffect } from 'react';
import { deleteField } from 'firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { onAuthChange } from '@core/firebase/auth';
import { getDocument, updateDocument } from '@core/firebase/firestore';
import type { User } from '@core/types/user';

type LegacyUserDoc = User & { role?: string };

export function useAuth() {
  const { user, activeMode, isLoading, setUser, setLoading, clear } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (!firebaseUser) {
        clear();
        return;
      }
      setLoading(true);
      try {
        const userData = await getDocument<LegacyUserDoc>(`users/${firebaseUser.uid}`);
        if (userData) {
          if ('role' in userData) {
            void updateDocument(`users/${firebaseUser.uid}`, { role: deleteField() } as any);
          }
          const { role: _role, ...cleanUser } = userData as any;
          setUser(cleanUser as User);
          setLoading(false);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error('[useAuth] Failed to load user document:', e);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  return { user, activeMode, isLoading };
}
