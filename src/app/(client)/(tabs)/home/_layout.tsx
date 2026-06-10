import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="builder" options={{ title: 'Build Your Crew' }} />
      <Stack.Screen name="details" options={{ title: 'Project Details' }} />
    </Stack>
  );
}
