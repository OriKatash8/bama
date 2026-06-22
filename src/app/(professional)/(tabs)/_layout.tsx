import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, ShoppingBag, User, ArrowLeftRight, MessageCircle } from 'lucide-react-native';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';
import { useTheme } from '@core/hooks/useTheme';

export default function ProfessionalTabsLayout() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const colors = useTheme();

  return (
    <>
      <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, height: 72 }, tabBarIconStyle: { marginTop: 8 }, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.textMuted }}>
        <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: ({ color }) => <LayoutDashboard size={28} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="marketplace" options={{ title: 'Marketplace', tabBarIcon: ({ color }) => <ShoppingBag size={28} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: ({ color }) => <MessageCircle size={28} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={28} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="portfolio" options={{ href: null }} />
        <Tabs.Screen name="bookings" options={{ href: null }} />
        <Tabs.Screen
          name="switch"
          options={{
            title: 'Switch',
            tabBarIcon: ({ color }) => <ArrowLeftRight size={28} color={color} strokeWidth={1.5} />,
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
