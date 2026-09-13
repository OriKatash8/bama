import { useRouter } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { getDocument } from '@core/firebase/firestore';
import { usePendingIntentStore } from '@core/stores/pendingIntentStore';
import type { ActiveMode, ProfessionalProfile } from '@core/types/user';

export function useSwitchMode() {
  const router = useRouter();
  const setActiveMode = useAuthStore((s) => s.setActiveMode);
  const userId = useAuthStore((s) => s.user?.id);

  async function switchMode(mode: ActiveMode) {
    setActiveMode(mode);
    // Every sign-in path ends here (sign-in -> mode-select -> switchMode), so this
    // is where a deep link opened while signed out picks back up. The saved href is
    // allowlist-checked and TTL-checked inside takeResume, and wins over the mode's
    // home in either mode: the routes it can hold live outside the mode groups and
    // do their own gating (the invite preview renders even for an incomplete pro).
    const resume = usePendingIntentStore.getState().takeResume();
    if (resume) {
      router.replace(resume as never);
      return;
    }
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
