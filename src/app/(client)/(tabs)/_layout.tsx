import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { Search, Home, User, MessageCircle } from 'lucide-react-native';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';
import { useUiStore } from '@core/stores/uiStore';
import {
  getFloatingTabBarStyle,
  FLOATING_TAB_BAR_ACTIVE_COLOR,
  FLOATING_TAB_BAR_INACTIVE_COLOR,
} from '@core/navigation/floatingTabBar';

export default function ClientTabsLayout() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const isDark = useUiStore((s) => s.isDark);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarStyle: getFloatingTabBarStyle(isDark),
          tabBarActiveTintColor: FLOATING_TAB_BAR_ACTIVE_COLOR,
          tabBarInactiveTintColor: isDark ? FLOATING_TAB_BAR_INACTIVE_COLOR.dark : FLOATING_TAB_BAR_INACTIVE_COLOR.light,
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={24} color={color} strokeWidth={2.5} /> }} />
        <Tabs.Screen name="browse" options={{ title: 'Search', tabBarIcon: ({ color }) => <Search size={24} color={color} strokeWidth={2.5} /> }} />
        <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: ({ color }) => <MessageCircle size={24} color={color} strokeWidth={2.5} /> }} />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerShown: false,
            tabBarIcon: ({ color }) => <User size={24} color={color} strokeWidth={2.5} />,
            tabBarButton: ({ style, children, onPress, href: _href, onLongPress: _onLongPress, ...rest }) => (
              <TouchableOpacity
                style={style}
                onPress={onPress ?? undefined}
                onLongPress={() => setSheetVisible(true)}
                delayLongPress={500}
                {...rest}
              >
                {children}
              </TouchableOpacity>
            ),
          }}
        />
        <Tabs.Screen name="chat/project-details" options={{ href: null }} />
        <Tabs.Screen name="chats/[chatId]" options={{ href: null }} />
        <Tabs.Screen name="switch" options={{ href: null }} />
      </Tabs>
      <ModeSwitcherSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}
