import { useState } from 'react';
import { useRouter } from 'expo-router';
import { updateDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import type { UserRole } from '@core/types/user';

type SetRoleState = {
  isLoading: boolean;
  error: string | null;
  selectRole: (role: UserRole) => Promise<void>;
};

export function useSetRole(): SetRoleState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user, setRole } = useAuthStore();
  const { showToast, setNewProfessional } = useUiStore();

  async function selectRole(role: UserRole) {
    if (user === null) {
      setError('No authenticated user. Please sign in again.');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await updateDocument(`users/${user.id}`, { role });
      setRole(role);
      if (role === 'professional') {
        setNewProfessional(true);
        router.replace('/(professional)/(tabs)/profile/');
      } else {
        router.replace('/(client)/(tabs)/browse/');
      }
    } catch (e: any) {
      const msg = toSetRoleError(e.code);
      showToast(msg, 'error');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, error, selectRole };
}

function toSetRoleError(code: string): string {
  switch (code) {
    default:
      return 'Something went wrong. Please try again.';
  }
}
