import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { AccessibilityState, GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import { FLOATING_TAB_BAR_ACTIVE_BG } from './floatingTabBar';

type TabButtonProps = {
  children: ReactNode;
  onPress?: ((e: GestureResponderEvent) => void) | null;
  onLongPress?: ((e: GestureResponderEvent) => void) | null;
  delayLongPress?: number | null;
  accessibilityState?: AccessibilityState;
  style?: StyleProp<ViewStyle>;
};

export function TabButton({ children, onPress, onLongPress, delayLongPress, accessibilityState, style }: TabButtonProps) {
  const isActive = accessibilityState?.selected ?? false;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      style={[style, { alignItems: 'center', justifyContent: 'center' }]}
    >
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: isActive ? FLOATING_TAB_BAR_ACTIVE_BG : 'transparent',
        }}
      >
        {children}
      </View>
    </Pressable>
  );
}
