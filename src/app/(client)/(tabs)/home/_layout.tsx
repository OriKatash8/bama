import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="builder" options={{ headerShown: true, title: 'Build Your Crew' }} />
      <Stack.Screen name="details" options={{ headerShown: true, title: 'Project Details' }} />
    </Stack>
  );
}
