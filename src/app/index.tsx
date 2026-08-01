import { Redirect } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  const { user, activeMode, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)" />;
  if (activeMode === null) return <Redirect href="/(auth)/mode-select" />;
  if (activeMode === 'client') return <Redirect href="/(client)/(tabs)/browse" />;
  return <Redirect href="/(professional)/(tabs)/dashboard" />;
}
