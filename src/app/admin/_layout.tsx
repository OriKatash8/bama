import { View, TouchableOpacity } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { Home, Flag, LogOut, Wallet, Boxes } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUiStore } from '@core/stores/uiStore';
import { useAppFont } from '@core/hooks/useAppFont';
import { useIsAdmin } from '@core/hooks/useIsAdmin';
import { useLogout } from '@features/auth/hooks/useLogout';
import { confirmDialog } from '@utils/confirmDialog';
import { cardShadow, useAdminPalette } from '@features/admin/ui';
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
  const { logout } = useLogout();
  const p = useAdminPalette();

  async function handleLogout() {
    const ok = await confirmDialog('Log out', 'Log out of the admin account?');
    if (ok) logout();
  }

  if (!loading && !isAdmin) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1 }}>
      {/* Pages get the real insets: each draws its own header below the status bar. */}
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
          name="money"
          options={{
            title: 'Money',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: focused ? 'rgba(255,255,255,0.35)' : 'transparent', borderWidth: focused ? 1.5 : 0, borderColor: focused ? 'rgba(255,255,255,0.6)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Wallet size={24} color={color} strokeWidth={2.5} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="operations"
          options={{
            title: 'Operations',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: focused ? 'rgba(255,255,255,0.35)' : 'transparent', borderWidth: focused ? 1.5 : 0, borderColor: focused ? 'rgba(255,255,255,0.6)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Boxes size={24} color={color} strokeWidth={2.5} />
              </View>
            ),
          }}
        />
        {/* Reached from the Operations hub — hidden from the tab bar. */}
        <Tabs.Screen name="courses" options={{ href: null }} />
        <Tabs.Screen name="communities" options={{ href: null }} />
        <Tabs.Screen name="marketplace" options={{ href: null }} />
      <Tabs.Screen name="fees" options={{ href: null }} />
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
        {/* Users opens from the dashboard's "total users" tile, not the tab bar. */}
        <Tabs.Screen name="users" options={{ href: null }} />
      </Tabs>

      {/* Log out — shown on every admin page; a white pill like the dashboard's cards */}
      <TouchableOpacity
        onPress={handleLogout}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Log out"
        testID="admin-logout"
        style={[
          {
            position: 'absolute',
            top: insets.top + 11,
            left: 16,
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            backgroundColor: p.surface,
            borderColor: p.border,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          },
          cardShadow(p),
        ]}
      >
        <LogOut size={18} color={p.text2} strokeWidth={2.2} />
      </TouchableOpacity>
    </View>
  );
}
