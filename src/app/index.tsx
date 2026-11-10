import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import { GatePendingScreen, useGatePending } from '@features/auth/components/GatePending';
import { nextAuthRoute } from '@features/auth/utils/nextAuthRoute';
import { useLaunchIntentStore } from '@core/stores/launchIntentStore';

/**
 * Set once the first launch decision has been made, for the life of the app
 * process. The FIRST visit to `/` lands on mode-select even when a last mode was
 * restored; later visits (e.g. a mid-session replace('/')) go to the mode's home,
 * so choosing a mode can't bounce the user back to the picker.
 */
let launchRouted = false;
/** Tests only. */
export function resetLaunchRouted() { launchRouted = false; }

export default function Index() {
  const user = useAuthStore((s) => s.user);
  const activeMode = useAuthStore((s) => s.activeMode);
  const isLoading = useAuthStore((s) => s.isLoading);
  const needsEmailVerification = useAuthStore((s) => s.needsEmailVerification);
  const proProfileCompleted = useAuthStore((s) => s.proProfileCompleted);
  const gatePending = useGatePending();
  const launchChecked = useLaunchIntentStore((s) => s.checked);
  const launchHasPending = useLaunchIntentStore((s) => s.hasPending);
  const ready = !isLoading && launchChecked && !!user && !gatePending;
  useEffect(() => {
    if (ready) launchRouted = true;
  }, [ready]);

  // isLoading covers the restored mode too (useAuth reads it before loading ends),
  // so mode-select never flashes up for a user who is about to go to their home.
  if (isLoading || !launchChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)" />;
  // Signed in, verification not known yet: wait rather than guess.
  if (gatePending) return <GatePendingScreen />;
  // consent → email verification → first-time setup → mode select → the app.
  const next = nextAuthRoute({ user, needsEmailVerification, activeMode, proProfileCompleted });
  // Opened by tapping a notification: its target beats the mode's home, and
  // useNotificationRouting navigates there. A gate (or mode-select) still goes first.
  if (launchHasPending && activeMode !== null && !next.startsWith('/(auth)')) return null;
  // Opening the app asks which mode to enter, rather than resuming the last one.
  if (!launchRouted && !next.startsWith('/(auth)')) return <Redirect href="/(auth)/mode-select" />;
  return <Redirect href={next as never} />;
}
