import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

export const FLOATING_TAB_BAR_ACTIVE_COLOR = '#004aad';

export const FLOATING_TAB_BAR_INACTIVE_COLOR = {
  dark: 'rgba(255,255,255,0.6)',
  light: 'rgba(15,15,31,0.4)',
} as const;

export function getFloatingTabBarStyle(isDark: boolean): ViewStyle {
  return {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 32,
    backgroundColor: isDark ? 'rgba(15, 15, 31, 0.4)' : 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(20px)' } as any) : null),
  };
}
