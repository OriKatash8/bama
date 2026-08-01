import { useRouter } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import type { ActiveMode } from '@core/types/user';

type SwitchModeState = {
  switchMode: (mode: ActiveMode) => void;
};

export function useSwitchMode(): SwitchModeState {
  const router = useRouter();
  const setActiveMode = useAuthStore((s) => s.setActiveMode);

  function switchMode(mode: ActiveMode) {
    setActiveMode(mode);
    if (mode === 'client') {
      router.replace('/(client)/(tabs)/browse');
    } else {
      router.replace('/(professional)/(tabs)/dashboard');
    }
  }

  return { switchMode };
}
