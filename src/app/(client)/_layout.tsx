import { Stack } from 'expo-router';
import { useTheme } from '@core/hooks/useTheme';

export default function ClientLayout() {
  const colors = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
