import { useEffect, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, ShoppingBag, User, MessageCircle } from 'lucide-react-native';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';
import { useTheme } from '@core/hooks/useTheme';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { listenToUserChats } from '@features/chat/services/chatService';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import {
  getFloatingTabBarStyle,
  FLOATING_TAB_BAR_ACTIVE_COLOR,
  FLOATING_TAB_BAR_INACTIVE_COLOR,
} from '@core/navigation/floatingTabBar';

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
  const [sheetVisible, setSheetVisible] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  const language = useSettingsStore((s) => s.language);
  const t = makeT(language === 'he' ? he : en);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!userId) { setTotalUnread(0); return; }
    return listenToUserChats(userId, (chats) => {
      const sum = chats.reduce((acc, c) => acc + (c.unreadCount?.[userId] ?? 0), 0);
      setTotalUnread(sum);
    });
  }, [userId]);

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
        <Tabs.Screen name="dashboard" options={{ title: t('tabs.notice_board'), tabBarIcon: ({ color }) => <LayoutDashboard size={24} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="marketplace" options={{ title: t('tabs.marketplace'), tabBarIcon: ({ color }) => <ShoppingBag size={24} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="chats" options={{ title: t('tabs.chats'), tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined, tabBarBadgeStyle: { backgroundColor: '#cb6ce6', color: 'white', fontSize: 10 }, tabBarIcon: ({ color }) => <MessageCircle size={24} color={color} strokeWidth={1.5} /> }} />
        <Tabs.Screen name="browse" options={{ href: null }} />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            headerShown: true,
            headerTitleAlign: 'center',
            headerStyle: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: '#cb6ce6' },
            headerShadowVisible: false,
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '800', fontSize: 20 },
            tabBarIcon: ({ color }) => <User size={24} color={color} strokeWidth={1.5} />,
            tabBarButton: ({ style, children, onPress }) => (
              <TouchableOpacity
                style={style ?? undefined}
                onPress={onPress ?? undefined}
                onLongPress={() => setSheetVisible(true)}
                delayLongPress={500}
              >
                {children as React.ReactNode}
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
