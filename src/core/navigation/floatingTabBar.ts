import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

export const FLOATING_TAB_BAR_ACTIVE_COLOR = '#004aad';

export const FLOATING_TAB_BAR_INACTIVE_COLOR = {
  dark: 'rgba(255,255,255,0.6)',
  light: 'rgba(15,15,31,0.4)',
} as const;

export const FLOATING_TAB_BAR_ACTIVE_BG = 'rgba(255,255,255,0.3)';

export function getFloatingTabBarStyle(isDark: boolean): ViewStyle {
  return {
    position: 'absolute',
    bottom: 24,
    start: Platform.OS === 'web' ? 50 : 18,
    end: Platform.OS === 'web' ? 50 : 18,
    minHeight: Platform.OS === 'web' ? 65 : 48,
    paddingBottom: Platform.OS === 'web' ? 8 : 4,
    paddingTop: Platform.OS === 'web' ? 8 : 4,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: isDark ? 'rgba(15, 15, 31, 0.85)' : 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(20px)' } as any) : null),
  };
}
