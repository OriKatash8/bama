import { useEffect } from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { subscribeToDocument } from '@core/firebase/firestore';
import type { ProfessionalProfile } from '@core/types/user';

export default function ProfessionalLayout() {
  const colors = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const activeMode = useAuthStore((s) => s.activeMode);
  const proProfileCompleted = useAuthStore((s) => s.proProfileCompleted);
  const setProProfileCompleted = useAuthStore((s) => s.setProProfileCompleted);
  const pathname = usePathname();

  // Single subscription to the pro's profile doc — feeds the lock signal read by
  // this guard, the tabs layout (tab bar / swipe) and the profile screen.
  useEffect(() => {
    if (!userId || activeMode !== 'professional') {
      setProProfileCompleted(null);
      return;
    }
    return subscribeToDocument<ProfessionalProfile>(
      `users/${userId}/profile/data`,
      (data) => setProProfileCompleted(data?.proProfileCompleted === true),
    );
  }, [userId, activeMode, setProProfileCompleted]);

  // First-time / incomplete pros are locked to the profile screen: any attempt to
  // be anywhere else redirects back there.
  const locked = activeMode === 'professional' && proProfileCompleted === false;
  const onProfile = pathname.includes('/profile');
  if (locked && !onProfile) {
    return <Redirect href="/(professional)/(tabs)/profile" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
