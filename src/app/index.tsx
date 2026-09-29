import { Redirect } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import { GatePendingScreen, useGatePending } from '@features/auth/components/GatePending';
import { nextAuthRoute } from '@features/auth/utils/nextAuthRoute';

export default function Index() {
  const { user, activeMode, isLoading, needsEmailVerification } = useAuthStore();
  const gatePending = useGatePending();

  if (isLoading) {
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
  return <Redirect href={nextAuthRoute({ user, needsEmailVerification, activeMode }) as never} />;
}
