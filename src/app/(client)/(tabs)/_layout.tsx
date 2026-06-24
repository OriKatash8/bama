import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { Search, Home, User, ArrowLeftRight, MessageCircle } from 'lucide-react-native';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';
import { useTheme } from '@core/hooks/useTheme';

export default function ClientTabsLayout() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const colors = useTheme();

  return (
    <>
      <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false, tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, height: 72 }, tabBarIconStyle: { marginTop: 8 }, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.textMuted }}>
        <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={28} color={color} strokeWidth={2.5} /> }} />
        <Tabs.Screen name="browse" options={{ title: 'Search', tabBarIcon: ({ color }) => <Search size={28} color={color} strokeWidth={2.5} /> }} />
        <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: ({ color }) => <MessageCircle size={28} color={color} strokeWidth={2.5} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <User size={28} color={color} strokeWidth={2.5} /> }} />
        <Tabs.Screen
          name="switch"
          options={{
            title: 'Switch',
            tabBarIcon: ({ color }) => <ArrowLeftRight size={28} color={color} strokeWidth={2.5} />,
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
