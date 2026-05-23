import { Tabs } from 'expo-router';

export default function ClientTabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
      <Tabs.Screen name="crew" options={{ title: 'Crew' }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
