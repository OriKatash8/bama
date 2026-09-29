import { Redirect } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import { GatePendingScreen, useGatePending } from '@features/auth/components/GatePending';
import { nextAuthRoute } from '@features/auth/utils/nextAuthRoute';
import { useLaunchIntentStore } from '@core/stores/launchIntentStore';

export default function Index() {
  const { user, activeMode, isLoading, needsEmailVerification, proProfileCompleted } = useAuthStore();
  const gatePending = useGatePending();
  const launch = useLaunchIntentStore();

  // isLoading covers the restored mode too (useAuth reads it before loading ends),
  // so mode-select never flashes up for a user who is about to go to their home.
  if (isLoading || !launch.checked) {
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
  if (launch.hasPending && activeMode !== null && !next.startsWith('/(auth)')) return null;
  return <Redirect href={next as never} />;
}
