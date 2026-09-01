import { useEffect, useRef, useState } from 'react';
import { View, Platform, PanResponder, Dimensions } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Search, Home, MessageCircle, FolderKanban } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useUiStore } from '@core/stores/uiStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useAuthStore } from '@core/stores/authStore';
import { useOffersSeenStore } from '@core/stores/offersSeenStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { listenToUserChats } from '@features/chat/services/chatService';
import { usePriceOffers } from '@features/offers/hooks/usePriceOffers';
import { useBundleOffers } from '@features/offers/hooks/useBundleOffers';
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

const CLIENT_TABS = ['home', 'browse', 'chats', 'projects'] as const;

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

  const pathname = usePathname();
  const inChatRoom = /\/chats\/.+/.test(pathname);
  // The project review screen is a focused wizard step with its own pinned
  // publish button — tab navigation mid-flow would drop the draft, and the
  // floating bar would sit on top of the button. Header stays.
  const inProjectReview = pathname.includes('/home/summary');
  const hideTabBar = inChatRoom || inProjectReview;

  // Badge the Projects tab for price offers newer than the client last viewed
  // it. Offers have no seen flag, so "last seen" is tracked per device.
  const { offers } = usePriceOffers();
  const { bundles } = useBundleOffers();
  const lastSeenAt = useOffersSeenStore((s) => s.lastSeenAt);
  const markSeen = useOffersSeenStore((s) => s.markSeen);
  const seenTs = userId ? (lastSeenAt[userId] ?? 0) : 0;
  const offerTimes = [...offers, ...bundles].map((o) => (o.createdAt?.seconds ?? 0) * 1000);
  const newOffers = offerTimes.filter((ts) => ts > seenTs).length;
  const maxOfferTs = offerTimes.length ? Math.max(...offerTimes) : 0;
  const onProjects = pathname.includes('/projects');
  useEffect(() => {
    if (onProjects && userId && maxOfferTs > 0) markSeen(userId, maxOfferTs);
  }, [onProjects, userId, maxOfferTs, markSeen]);

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
        if (inChatRoomRef.current) return false;
        const startX = gs.moveX - gs.dx;
        const screenWidth = Dimensions.get('window').width;
        const EDGE_ZONE = 50;
        const fromEdge = startX < EDGE_ZONE || startX > screenWidth - EDGE_ZONE;
        if (!fromEdge) return false;
        return Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5;
      },
      onPanResponderRelease: (_, gs) => {
        if (inChatRoomRef.current) return;
        const idx = CLIENT_TABS.findIndex((t) => pathnameRef.current.includes(`/${t}`));
        if (idx === -1) return;
        if (gs.dx < -80) {
          const next = idx + 1;
          if (next < CLIENT_TABS.length) {
            routerRef.current.navigate(`/(client)/(tabs)/${CLIENT_TABS[next]}` as never);
          }
        } else if (gs.dx > 80) {
          const prev = idx - 1;
          if (prev >= 0) {
            routerRef.current.navigate(`/(client)/(tabs)/${CLIENT_TABS[prev]}` as never);
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
            tabBarStyle: hideTabBar ? { display: 'none' } : getFloatingTabBarStyle(isDark),
            tabBarBackground: () => <SlidingTabBackground numTabs={4} tabNames={['home', 'browse', 'chats', 'projects']} />,
            tabBarActiveTintColor: '#004aad',
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
              tabBarItemStyle: { paddingVertical: Platform.OS === 'web' ? 6 : 3, height: Platform.OS === 'web' ? 65 : 48, justifyContent: 'center', alignItems: 'center', transform: Platform.OS === 'web' ? [] : [{ translateY: -7 }] },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
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
              tabBarItemStyle: { paddingVertical: Platform.OS === 'web' ? 6 : 3, height: Platform.OS === 'web' ? 65 : 48, justifyContent: 'center', alignItems: 'center', transform: Platform.OS === 'web' ? [] : [{ translateY: -7 }] },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
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
              tabBarItemStyle: { paddingVertical: Platform.OS === 'web' ? 6 : 3, height: Platform.OS === 'web' ? 65 : 48, justifyContent: 'center', alignItems: 'center', transform: Platform.OS === 'web' ? [] : [{ translateY: -7 }] },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
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
              tabBarBadge: newOffers > 0 ? (newOffers > 99 ? '99+' : newOffers) : undefined,
              tabBarBadgeStyle: { backgroundColor: '#cb6ce6', color: 'white', fontSize: 10 },
              tabBarItemStyle: { paddingVertical: Platform.OS === 'web' ? 6 : 3, height: Platform.OS === 'web' ? 65 : 48, justifyContent: 'center', alignItems: 'center', transform: Platform.OS === 'web' ? [] : [{ translateY: -7 }] },
              tabBarIcon: ({ color, focused }) => (
                <View style={{ alignItems: 'center' }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
                    <FolderKanban size={20} color={color} strokeWidth={2.5} />
                  </View>
                </View>
              ),
            }}
          />
          <Tabs.Screen name="switch" options={{ href: null }} />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
