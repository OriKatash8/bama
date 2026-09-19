import { use } from 'react';
import { Platform } from 'react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
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

// ── Docked glass tab bar (client + pro). Admin keeps the floating style above. ──

// TODO: promote to theme tokens. useTheme's `accent` is the pink badge colour
// (#cb6ce6), so the active tab colours live here for now, one per app.
export const CLIENT_TAB_ACTIVE = '#004aad';
export const PRO_TAB_ACTIVE = '#D97706';

/** The bar's content band — icon + label — above the bottom safe-area inset. */
export const TAB_BAR_CONTENT_HEIGHT = Platform.OS === 'web' ? 58 : 50;

/** Space between the last content on a screen and the top of the tab bar. */
export const TAB_BAR_CONTENT_GAP = 16;

/** How far the admin's floating pill sits above the screen edge (bottom: 24). */
export const FLOATING_TAB_BAR_BOTTOM = 24;

/** One item style for every tab: fills the content band, icon over label. */
export const TAB_ITEM_STYLE: ViewStyle = {
  height: TAB_BAR_CONTENT_HEIGHT,
  paddingTop: 6,
  paddingBottom: 4,
  justifyContent: 'center',
  alignItems: 'center',
};

/**
 * A full-width bar docked to the bottom edge. Transparent: the material is
 * drawn by GlassTabBarBackground. The bar owns the bottom safe-area inset — its
 * height includes it — so useBottomTabBarHeight() already accounts for the home
 * indicator and screens must not add insets.bottom on top.
 */
export function getDockedTabBarStyle(bottomInset: number): ViewStyle {
  return {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB_BAR_CONTENT_HEIGHT + bottomInset,
    paddingTop: 0,
    paddingBottom: bottomInset,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  };
}

/**
 * The docked tab bar's measured height, read from the navigator's context. It
 * already includes the bottom safe-area inset (the bar owns it), so never add
 * insets.bottom on top.
 *
 * Reads the context rather than useBottomTabBarHeight(), which throws when
 * there is no navigator. The fallback is TAB_BAR_CONTENT_HEIGHT — the content
 * band ONLY, excluding the safe-area inset. It's expected only outside a
 * bottom-tab navigator (a screen rendered directly in a test); inside the app a
 * miss is a bug, so it warns in development.
 *
 * Hidden-bar caveat: on a screen where tabBarStyle is display:'none', the value
 * is the navigator's last laid-out bar height — stale, not 0. No screen that
 * uses this is hidden-bar today; one that becomes so must not rely on it.
 */
export function useTabBarHeight(): number {
  const height = use(BottomTabBarHeightContext);
  if (height === undefined) {
    if (__DEV__) {
      console.warn(
        '[tabs] BottomTabBarHeightContext missing — falling back to TAB_BAR_CONTENT_HEIGHT (no safe-area inset). Is this screen outside the tab navigator?',
      );
    }
    return TAB_BAR_CONTENT_HEIGHT;
  }
  return height;
}

/** Bottom padding that clears the docked tab bar: its height + a small gap. */
export function useTabBarClearance(): number {
  return useTabBarHeight() + TAB_BAR_CONTENT_GAP;
}

/** Room for a + button (56) floating above the bar: list padding that lets the
 *  last item scroll clear of both. */
export const FAB_SIZE = 56;
