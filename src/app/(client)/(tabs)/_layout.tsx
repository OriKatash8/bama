import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { ModeSwitcherSheet } from '@features/auth/components/ModeSwitcherSheet';

export default function ClientTabsLayout() {
  const [sheetVisible, setSheetVisible] = useState(false);

  return (
    <>
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="browse" options={{ title: 'Search' }} />
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        <Tabs.Screen
          name="switch"
          options={{
            title: 'Switch',
            tabBarButton: ({ style, children, onPress: _onPress, href: _href, ...rest }) => (
              <TouchableOpacity
                style={style}
                onPress={() => setSheetVisible(true)}
                accessibilityLabel="Switch account"
                {...rest}
              >
                {children}
              </TouchableOpacity>
            ),
          }}
        />
      </Tabs>
      <ModeSwitcherSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}
