import { useState } from 'react';
import { useRouter } from 'expo-router';
import { signUp } from '@core/firebase/auth';
import { setDocument } from '@core/firebase/firestore';
import { useAuthStore } from '@core/stores/authStore';
import { useUiStore } from '@core/stores/uiStore';
import type { UserRole } from '@core/types/user';

type RegisterState = {
  isLoading: boolean;
  error: string | null;
  register: (fullName: string, email: string, password: string, role: UserRole) => Promise<void>;
};

export function useRegister(): RegisterState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setUser, setRole } = useAuthStore();
  const { showToast, setNewProfessional } = useUiStore();

  async function register(fullName: string, email: string, password: string, role: UserRole) {
    setError(null);
    setIsLoading(true);
    try {
      const firebaseUser = await signUp(email, password);
      const userData = {
        id: firebaseUser.uid,
        email,
        displayName: fullName,
        photoURL: null,
        role,
        createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };
      await setDocument(`users/${firebaseUser.uid}`, userData);
      setUser(userData);
      setRole(role);
      if (role === 'professional') {
        setNewProfessional(true);
        router.replace('/(professional)/(tabs)/profile/');
      } else {
        router.replace('/(client)/(tabs)/browse/');
      }
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
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
