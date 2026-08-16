import { useEffect, useState } from 'react';
import { View, Platform } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
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
  FLOATING_TAB_BAR_INACTIVE_COLOR,
} from '@core/navigation/floatingTabBar';
import { SlidingTabBackground } from '@core/navigation/SlidingTabBackground';

type Translations = typeof en;

function makeT(translations: Translations) {
  return (key: string): string => {
    const keys = key.split('.');
    let result: unknown = translations;
    for (const k of keys) result = (result as Record<string, unknown>)?.[k];
    return typeof result === 'string' ? result : key;
  };
}

const PROF_TABS = ['dashboard', 'marketplace', 'chats', 'profile'] as const;

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

  const pathname = usePathname();
  const inChatRoom = /\/chats\/.+/.test(pathname);

  const router = useRouter();
  const currentTabIndex = PROF_TABS.findIndex((t) => pathname.includes(`/${t}`));

  const tabSwipeGesture = Gesture.Pan()
    .activeOffsetX([-50, 50])
    .failOffsetY([-20, 20])
    .enabled(!inChatRoom)
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX < -80 && currentTabIndex !== -1) {
        const next = currentTabIndex + 1;
        if (next < PROF_TABS.length) {
          router.navigate(`/(professional)/(tabs)/${PROF_TABS[next]}` as never);
        }
      } else if (e.translationX > 80 && currentTabIndex !== -1) {
        const prev = currentTabIndex - 1;
        if (prev >= 0) {
          router.navigate(`/(professional)/(tabs)/${PROF_TABS[prev]}` as never);
        }
      }
    });

  return (
    <GestureDetector gesture={tabSwipeGesture}>
    <View style={{ flex: 1 }}>
      {!inChatRoom && <AppHeader />}
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0, bottom: 0 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarStyle: inChatRoom ? { display: 'none' } : getFloatingTabBarStyle(isDark),
            tabBarBackground: () => <SlidingTabBackground numTabs={4} tabNames={['dashboard', 'marketplace', 'chats', 'profile']} />,
            tabBarActiveTintColor: '#004aad',
            tabBarInactiveTintColor: isDark ? FLOATING_TAB_BAR_INACTIVE_COLOR.dark : FLOATING_TAB_BAR_INACTIVE_COLOR.light,
            tabBarActiveBackgroundColor: 'transparent',
            tabBarInactiveBackgroundColor: 'transparent',
            tabBarItemStyle: { paddingVertical: 4 },
            tabBarLabelStyle: { fontSize: 10, ...font.regular, marginTop: -4 },
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: t('tabs.notice_board'),
              tabBarItemStyle: { paddingVertical: Platform.OS === 'web' ? 6 : 3, height: Platform.OS === 'web' ? 65 : 48, justifyContent: 'center', alignItems: 'center', transform: Platform.OS === 'web' ? [] : [{ translateY: -7 }] },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                    <LayoutDashboard size={20} color={color} strokeWidth={1.5} />
                  </View>
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="marketplace"
            options={{
              title: t('tabs.marketplace'),
              tabBarItemStyle: { paddingVertical: Platform.OS === 'web' ? 6 : 3, height: Platform.OS === 'web' ? 65 : 48, justifyContent: 'center', alignItems: 'center', transform: Platform.OS === 'web' ? [] : [{ translateY: -7 }] },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                    <ShoppingBag size={20} color={color} strokeWidth={1.5} />
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
              tabBarItemStyle: { paddingVertical: Platform.OS === 'web' ? 6 : 3, height: Platform.OS === 'web' ? 65 : 48, justifyContent: 'center', alignItems: 'center', transform: Platform.OS === 'web' ? [] : [{ translateY: -7 }] },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                    <MessageCircle size={20} color={color} strokeWidth={1.5} />
                  </View>
                </View>
              ),
            }}
          />
          <Tabs.Screen name="browse" options={{ href: null }} />
          <Tabs.Screen
            name="profile"
            options={{
              title: t('tabs.profile'),
              tabBarItemStyle: { paddingVertical: Platform.OS === 'web' ? 6 : 3, height: Platform.OS === 'web' ? 65 : 48, justifyContent: 'center', alignItems: 'center', transform: Platform.OS === 'web' ? [] : [{ translateY: -7 }] },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                    <User size={20} color={color} strokeWidth={1.5} />
                  </View>
                </View>
              ),
            }}
          />
          <Tabs.Screen name="portfolio" options={{ href: null }} />
          <Tabs.Screen name="bookings" options={{ href: null }} />
          <Tabs.Screen name="switch" options={{ href: null }} />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
    </GestureDetector>
  );
}
