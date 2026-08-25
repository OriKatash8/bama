import { useRouter } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument } from '@core/firebase/firestore';
import type { ActiveMode, ProfessionalProfile } from '@core/types/user';

export function useSwitchMode() {
  const router = useRouter();
  const setActiveMode = useAuthStore((s) => s.setActiveMode);
  const userId = useAuthStore((s) => s.user?.id);

  async function switchMode(mode: ActiveMode) {
    setActiveMode(mode);
    if (mode === 'client') {
      router.replace('/(client)/(tabs)/home');
    } else {
      const profile = userId
        ? await getDocument<ProfessionalProfile>(`users/${userId}/profile/data`)
        : null;
      // A completed profile goes to the dashboard; otherwise land on (and lock to)
      // the profile screen so the pro must finish their details first.
      router.replace(
        profile?.proProfileCompleted
          ? '/(professional)/(tabs)/dashboard'
          : '/(professional)/(tabs)/profile',
      );
    }
  }

  return { switchMode };
}
