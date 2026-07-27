import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Pressable } from 'react-native';
import type { StyleProp, ViewStyle, GestureResponderEvent } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, ShoppingBag, User, MessageCircle } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { listenToUserChats } from '@features/chat/services/chatService';
import { AppHeader } from '@components/layout/AppHeader';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import {
  getFloatingTabBarStyle,
  FLOATING_TAB_BAR_ACTIVE_COLOR,
  FLOATING_TAB_BAR_INACTIVE_COLOR,
} from '@core/navigation/floatingTabBar';

type TabButtonProps = {
  children: ReactNode;
  onPress?: ((event: GestureResponderEvent) => void) | null;
  accessibilityState?: { selected?: boolean };
  style?: StyleProp<ViewStyle>;
};

function TabButton({ children, onPress, accessibilityState, style }: TabButtonProps) {
  const isActive = accessibilityState?.selected ?? false;
  return (
    <Pressable
      onPress={onPress ?? undefined}
      style={[style, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}
    >
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 16,
          backgroundColor: isActive ? 'rgba(0,74,173,0.15)' : 'transparent',
        }}
      >
        {children}
      </View>
    </Pressable>
  );
}

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

export default function ProfessionalTabsLayout() {
  const [totalUnread, setTotalUnread] = useState(0);
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const userId = useAuthStore((s) => s.user?.id);
  const font = useAppFont();

  useEffect(() => {
    if (!userId) { setTotalUnread(0); return; }
    return listenToUserChats(userId, (chats) => {
      const sum = chats.reduce((acc, c) => acc + (c.unreadCount?.[userId] ?? 0), 0);
      setTotalUnread(sum);
    });
  }, [userId]);

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarStyle: getFloatingTabBarStyle(isDark),
            tabBarActiveTintColor: FLOATING_TAB_BAR_ACTIVE_COLOR,
            tabBarInactiveTintColor: isDark ? FLOATING_TAB_BAR_INACTIVE_COLOR.dark : FLOATING_TAB_BAR_INACTIVE_COLOR.light,
            tabBarLabelStyle: { fontSize: 11, fontFamily: font.regular },
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: t('tabs.notice_board'),
              tabBarButton: TabButton,
              tabBarIcon: ({ color }) => <LayoutDashboard size={24} color={color} strokeWidth={1.5} />,
            }}
          />
          <Tabs.Screen
            name="marketplace"
            options={{
              title: t('tabs.marketplace'),
              tabBarButton: TabButton,
              tabBarIcon: ({ color }) => <ShoppingBag size={24} color={color} strokeWidth={1.5} />,
            }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: t('tabs.chats'),
              tabBarButton: TabButton,
              tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
              tabBarBadgeStyle: { backgroundColor: '#cb6ce6', color: 'white', fontSize: 10 },
              tabBarIcon: ({ color }) => <MessageCircle size={24} color={color} strokeWidth={1.5} />,
            }}
          />
          <Tabs.Screen name="browse" options={{ href: null }} />
          <Tabs.Screen
            name="profile"
            options={{
              title: t('tabs.profile'),
              tabBarButton: TabButton,
              headerShown: true,
              headerTitleAlign: 'center',
              headerStyle: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: '#cb6ce6' },
              headerShadowVisible: false,
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '800', fontSize: 20 },
              tabBarIcon: ({ color }) => <User size={24} color={color} strokeWidth={1.5} />,
            }}
          />
          <Tabs.Screen name="portfolio" options={{ href: null }} />
          <Tabs.Screen name="bookings" options={{ href: null }} />
          <Tabs.Screen name="chats/[chatId]" options={{ href: null }} />
          <Tabs.Screen name="switch" options={{ href: null }} />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
