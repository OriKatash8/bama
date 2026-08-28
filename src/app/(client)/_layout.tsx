import { useEffect } from 'react';
import { Stack, Redirect, usePathname } from 'expo-router';
import { useTheme } from '@core/hooks/useTheme';
import { useAuthStore } from '@core/stores/authStore';
import { subscribeToDocument } from '@core/firebase/firestore';
import type { User } from '@core/types/user';

export default function ClientLayout() {
  const colors = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const activeMode = useAuthStore((s) => s.activeMode);
  const clientOnboarded = useAuthStore((s) => s.clientOnboarded);
  const setClientOnboarded = useAuthStore((s) => s.setClientOnboarded);
  const pathname = usePathname();

  // Track the first-time client onboarding flag from the user doc.
  useEffect(() => {
    if (!userId || activeMode !== 'client') {
      setClientOnboarded(null);
      return;
    }
    return subscribeToDocument<User>(`users/${userId}`, (data) =>
      setClientOnboarded(data?.clientOnboarded === true),
    );
  }, [userId, activeMode, setClientOnboarded]);

  // First-time clients are routed to the onboarding screen until they finish it.
  const needsOnboarding = activeMode === 'client' && clientOnboarded === false;
  if (needsOnboarding && !pathname.includes('/onboarding')) {
    return <Redirect href="/(client)/onboarding" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
