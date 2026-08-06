import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Search, Home, MessageCircle, FolderKanban } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';
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

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

export default function ClientTabsLayout() {
  const [totalUnread, setTotalUnread] = useState(0);
  const insets = useSafeAreaInsets();
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
            tabBarActiveBackgroundColor: 'transparent',
            tabBarInactiveBackgroundColor: 'transparent',
            tabBarItemStyle: { paddingVertical: 4 },
            tabBarLabelStyle: { fontSize: 10, ...font.regular, marginTop: -4 },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: t('tabs.home'),
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: focused ? 'rgba(0,0,0,0.08)' : 'transparent',
                    marginBottom: 2,
                  }}>
                    <Home size={20} color={color} strokeWidth={2.5} />
                  </View>
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="browse"
            options={{
              title: t('tabs.search'),
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: focused ? 'rgba(0,0,0,0.08)' : 'transparent',
                    marginBottom: 2,
                  }}>
                    <Search size={20} color={color} strokeWidth={2.5} />
                  </View>
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: t('tabs.chats'),
              tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
              tabBarBadgeStyle: { backgroundColor: '#cb6ce6', color: 'white', fontSize: 10 },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: focused ? 'rgba(0,0,0,0.08)' : 'transparent',
                    marginBottom: 2,
                  }}>
                    <MessageCircle size={20} color={color} strokeWidth={2.5} />
                  </View>
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="projects"
            options={{
              title: t('tabs.projects'),
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: focused ? 'rgba(0,0,0,0.08)' : 'transparent',
                    marginBottom: 2,
                  }}>
                    <FolderKanban size={20} color={color} strokeWidth={2.5} />
                  </View>
                </View>
              ),
            }}
          />
          <Tabs.Screen name="profile" options={{ href: null }} />
          <Tabs.Screen name="chat/project-details" options={{ href: null }} />
          <Tabs.Screen name="chats/[chatId]" options={{ href: null }} />
          <Tabs.Screen name="switch" options={{ href: null }} />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
