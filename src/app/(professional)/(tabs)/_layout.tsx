import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';
import { useTheme } from '@core/hooks/useTheme';

export default function ProfessionalTabsLayout() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const colors = useTheme();

  return (
    <>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border }, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.textMuted }}>
        <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="portfolio" options={{ title: 'Portfolio' }} />
        <Tabs.Screen name="marketplace" options={{ title: 'Marketplace' }} />
        <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        <Tabs.Screen
          name="switch"
          options={{
            title: 'Switch',
            tabBarButton: ({ style, children, onPress: _onPress, href: _href, ...rest }) => (
              <TouchableOpacity
                style={style}
                onPress={() => setSheetVisible(true)}
                accessibilityLabel="Switch account"
                {...rest}
              >
                {children}
              </TouchableOpacity>
            ),
          }}
        />
      </Tabs>
      <ModeSwitcherSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}
