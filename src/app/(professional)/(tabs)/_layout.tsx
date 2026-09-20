import { AppHeader } from '@components/layout/AppHeader';
import { useAppFont } from '@core/hooks/useAppFont';
import { useTheme } from '@core/hooks/useTheme';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import {
  TAB_INACTIVE,
  getDockedTabBarStyle,
  PRO_TAB_ACTIVE,
  TAB_ITEM_STYLE,
} from '@core/navigation/floatingTabBar';
import { GlassTabBarBackground } from '@core/navigation/GlassTabBarBackground';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { listenToUserChats } from '@features/chat/services/chatService';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { LayoutDashboard, MessageCircle, ShoppingBag, User } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, PanResponder, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

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

export default function ProfessionalTabsLayout() {   const [totalUnread, setTotalUnread] = useState(0);
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const isDark = useUiStore((s) => s.isDark);
  // The profile's editor puts its own Save/Cancel bar at the bottom; the tab
  // bar would sit on top of it (and navigating away mid-edit drops the edits).
  const profileEditing = useUiStore((s) => s.profileEditing);
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

  // First-time / incomplete pros are locked on the profile screen.
  const locked = useAuthStore((s) => s.proProfileCompleted) === false;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const inChatRoomRef = useRef(inChatRoom);
  inChatRoomRef.current = inChatRoom;
  const routerRef = useRef(router);
  routerRef.current = router;

  const tabPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        if (lockedRef.current || inChatRoomRef.current) return false;
        const startX = gs.moveX - gs.dx;
        const screenWidth = Dimensions.get('window').width;
        const EDGE_ZONE = 50;
        const fromEdge = startX < EDGE_ZONE || startX > screenWidth - EDGE_ZONE;
        if (!fromEdge) return false;
        return Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5;
      },
      onPanResponderRelease: (_, gs) => {
        if (lockedRef.current || inChatRoomRef.current) return;
        const idx = PROF_TABS.findIndex((t) => pathnameRef.current.includes(`/${t}`));
        if (idx === -1) return;
        if (gs.dx < -80) {
          const next = idx + 1;
          if (next < PROF_TABS.length) {
            routerRef.current.navigate(`/(professional)/(tabs)/${PROF_TABS[next]}` as never);
          }
        } else if (gs.dx > 80) {
          const prev = idx - 1;
          if (prev >= 0) {
            routerRef.current.navigate(`/(professional)/(tabs)/${PROF_TABS[prev]}` as never);
          }
        }
      },
    })
  ).current;

  return (
    <View style={{ flex: 1 }} {...tabPanResponder.panHandlers}>
      {!inChatRoom && <AppHeader />}
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0, bottom: 0 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarStyle: (locked || inChatRoom || profileEditing) ? { display: 'none' } : getDockedTabBarStyle(insets.bottom),
            // Docked glass bar; it owns the bottom safe-area inset (the provider
            // below zeroes it for the screens, so the real inset is passed in).
            tabBarBackground: () => <GlassTabBarBackground activeColor={PRO_TAB_ACTIVE} isDark={isDark} tabNames={['dashboard', 'marketplace', 'chats', 'profile']} />,
            tabBarActiveTintColor: PRO_TAB_ACTIVE,
            tabBarInactiveTintColor: isDark ? TAB_INACTIVE.dark : TAB_INACTIVE.light,
            tabBarActiveBackgroundColor: 'transparent',
            tabBarInactiveBackgroundColor: 'transparent',
            tabBarItemStyle: TAB_ITEM_STYLE,
            tabBarLabelStyle: { fontSize: 10, ...font.regular, marginTop: -4 },
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: t('tabs.notice_board'),
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
              tabBarBadgeStyle: { backgroundColor: PRO_TAB_ACTIVE, color: 'white', fontSize: 10 },
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
  );
}
