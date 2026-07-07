import { Stack } from 'expo-router';

export default function BrowseLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="profile/[userId]" />
    </Stack>
  );
}
