import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, ShoppingBag, User, MessageCircle } from 'lucide-react-native';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import {
  getFloatingTabBarStyle,
  FLOATING_TAB_BAR_ACTIVE_COLOR,
  FLOATING_TAB_BAR_INACTIVE_COLOR,
} from '@core/navigation/floatingTabBar';

export default function ProfessionalTabsLayout() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const colors = useTheme();
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
        <Tabs.Screen name="dashboard" options={{ title: 'Notice Board', tabBarIcon: ({ color }) => <LayoutDashboard size={24} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="marketplace" options={{ title: 'Marketplace', tabBarIcon: ({ color }) => <ShoppingBag size={24} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: ({ color }) => <MessageCircle size={24} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="browse" options={{ href: null }} />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            headerShown: true,
            headerTitleAlign: 'center',
            headerStyle: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: '#cb6ce6' },
            headerShadowVisible: false,
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '800', fontSize: 20 },
            tabBarIcon: ({ color }) => <User size={24} color={color} strokeWidth={1.5} />,
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
        <Tabs.Screen name="portfolio" options={{ href: null }} />
        <Tabs.Screen name="bookings" options={{ href: null }} />
        <Tabs.Screen name="chats/[chatId]" options={{ href: null }} />
        <Tabs.Screen name="switch" options={{ href: null }} />
      </Tabs>
      <ModeSwitcherSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}
