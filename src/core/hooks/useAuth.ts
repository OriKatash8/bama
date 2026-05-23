import { useEffect } from 'react';
import { useAuthStore } from '@core/stores/authStore';
import { onAuthChange } from '@core/firebase/auth';
import { getDocument } from '@core/firebase/firestore';
import type { User } from '@core/types/user';

export function useAuth() {
  const { user, role, isLoading, setUser, setRole, setLoading, clear } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (!firebaseUser) {
        clear();
        return;
      }
      setLoading(true);
      const userData = await getDocument<User>(`users/${firebaseUser.uid}`);
      if (userData) {
        setUser(userData);
        setRole(userData.role);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, role, isLoading };
}
