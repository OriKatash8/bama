import { View } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { Home, BookOpen, Users, Flag } from 'lucide-react-native';
import { useSafeAreaInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useUiStore } from '@core/stores/uiStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useIsAdmin } from '@core/hooks/useIsAdmin';
import {
  getFloatingTabBarStyle,
  FLOATING_TAB_BAR_ACTIVE_COLOR,
  FLOATING_TAB_BAR_INACTIVE_COLOR,
} from '@core/navigation/floatingTabBar';

export default function AdminTabsLayout() {
  const { isAdmin, loading } = useIsAdmin();
  const insets = useSafeAreaInsets();
  const isDark = useUiStore((s) => s.isDark);
  const font = useAppFont();

  if (!loading && !isAdmin) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarShowLabel: true,
            tabBarStyle: getFloatingTabBarStyle(isDark),
            tabBarActiveTintColor: FLOATING_TAB_BAR_ACTIVE_COLOR,
            tabBarInactiveTintColor: isDark ? FLOATING_TAB_BAR_INACTIVE_COLOR.dark : FLOATING_TAB_BAR_INACTIVE_COLOR.light,
            tabBarLabelStyle: { fontSize: 11, ...font.regular },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Dashboard',
              tabBarIcon: ({ color, focused }) => (
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: focused ? 'rgba(255,255,255,0.35)' : 'transparent', borderWidth: focused ? 1.5 : 0, borderColor: focused ? 'rgba(255,255,255,0.6)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Home size={24} color={color} strokeWidth={2.5} />
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="courses"
            options={{
              title: 'Courses',
              tabBarIcon: ({ color, focused }) => (
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: focused ? 'rgba(255,255,255,0.35)' : 'transparent', borderWidth: focused ? 1.5 : 0, borderColor: focused ? 'rgba(255,255,255,0.6)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={24} color={color} strokeWidth={2.5} />
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="communities"
            options={{
              title: 'Communities',
              tabBarIcon: ({ color, focused }) => (
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: focused ? 'rgba(255,255,255,0.35)' : 'transparent', borderWidth: focused ? 1.5 : 0, borderColor: focused ? 'rgba(255,255,255,0.6)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={24} color={color} strokeWidth={2.5} />
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="reports"
            options={{
              title: 'Reports',
              tabBarIcon: ({ color, focused }) => (
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: focused ? 'rgba(255,255,255,0.35)' : 'transparent', borderWidth: focused ? 1.5 : 0, borderColor: focused ? 'rgba(255,255,255,0.6)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <Flag size={24} color={color} strokeWidth={2.5} />
                </View>
              ),
            }}
          />
        </Tabs>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
