import { Redirect } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import { GatePendingScreen, useGatePending } from '@features/auth/components/GatePending';

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
  // The first gate rung, before a mode is even chosen (useOnboardingGate).
  if (needsEmailVerification === true) return <Redirect href={'/(auth)/verify-email' as never} />;
  if (activeMode === null) return <Redirect href="/(auth)/mode-select" />;
  if (activeMode === 'client') return <Redirect href="/(client)/(tabs)/browse" />;
  return <Redirect href="/(professional)/(tabs)/dashboard" />;
}
