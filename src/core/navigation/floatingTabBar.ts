import { use } from 'react';
import { Platform } from 'react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useSegments } from 'expo-router';
import { useAuthStore } from '@core/stores/authStore';
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
export const CLIENT_TAB_ACTIVE = '#6D28D9';
export const PRO_TAB_ACTIVE = '#1D4ED8';
/** Unselected tabs on the client/pro capsule: black in light mode; dark mode
 *  keeps the light tint, since black wouldn't read on the dark material.
 *  (Admin keeps FLOATING_TAB_BAR_INACTIVE_COLOR.) */
export const TAB_INACTIVE = { light: '#000000', dark: FLOATING_TAB_BAR_INACTIVE_COLOR.dark } as const;

/** The bar's content band — icon + label — above the bottom safe-area inset.
 *  56 on native: the icon box (28) and a Heebo label (16pt line box, pulled up
 *  4) are 40 tall, so this leaves ~6pt between them and the highlight pill on
 *  each side. Screens clear the bar by its measured height, so they follow. */
export const TAB_BAR_CONTENT_HEIGHT = Platform.OS === 'web' ? 58 : 56;

/** Space between the last content on a screen and the top of the tab bar. */
export const TAB_BAR_CONTENT_GAP = 16;

/** How far the capsule floats above the bottom safe-area inset. Negative lets
 *  it sit INTO that strip (over the home indicator); the space below it is
 *  floored at 0, so a device without an inset never gets negative padding. */
export const TAB_BAR_BOTTOM_OFFSET = -8;
/** The capsule's inset from each side of the screen. */
export const TAB_BAR_SIDE_MARGIN = 16;
/** Half the content height: a true capsule. */
export const TAB_BAR_CAPSULE_RADIUS = TAB_BAR_CONTENT_HEIGHT / 2;

/** How far the admin's floating pill sits above the screen edge (bottom: 24). */
export const FLOATING_TAB_BAR_BOTTOM = 24;

/** One item style for every tab: fills the content band, icon over label. */
export const TAB_ITEM_STYLE: ViewStyle = {
  height: TAB_BAR_CONTENT_HEIGHT,
  // Equal, so icon + label sit centred in the capsule.
  paddingTop: 5,
  paddingBottom: 5,
  justifyContent: 'center',
  alignItems: 'center',
};

/**
 * The tab bar's box: full width, from the screen's bottom edge up to the top of
 * the capsule. Transparent — GlassTabBarBackground draws the capsule inside it,
 * inset TAB_BAR_SIDE_MARGIN from each side and floating TAB_BAR_BOTTOM_OFFSET
 * above the bottom safe-area inset, which stays empty below it.
 *
 * The clearance contract: the height INCLUDES the inset and the float gap, so
 * useBottomTabBarHeight() / useTabBarHeight() report a number that clears the
 * whole thing. Screens must not add insets.bottom on top.
 *
 * The padding confines the tab row to the capsule band, so every tab's touch
 * target lies inside the capsule — none reaches into the gap or the margins.
 * pointerEvents 'box-none' lets taps in that transparent gap and the margins
 * reach the content scrolled beneath. (tabBarStyle is applied after the
 * navigator's own pointerEvents, so this wins.)
 */
export function getDockedTabBarStyle(bottomInset: number): ViewStyle {
  const bottomSpace = Math.max(0, bottomInset + TAB_BAR_BOTTOM_OFFSET);
  return {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB_BAR_CONTENT_HEIGHT + bottomSpace,
    paddingTop: 0,
    paddingBottom: bottomSpace,
    paddingHorizontal: TAB_BAR_SIDE_MARGIN,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    pointerEvents: 'box-none',
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

/**
 * The accent for shared UI that appears in both modes (profile tabs, reviews,
 * portfolio): purple under the client app, blue under the pro app — the same
 * colours as the tab bar. `tint` is a light wash of it for backgrounds.
 * Off the two app sections (e.g. /settings), the user's active mode decides.
 */
export function useModeAccent(): { accent: string; tint: string } {
  const segments = useSegments();
  const activeMode = useAuthStore((s) => s.activeMode);
  const section = segments[0];
  const isClient =
    section === '(client)' ? true
    : section === '(professional)' ? false
    : activeMode === 'client';
  return isClient
    ? { accent: CLIENT_TAB_ACTIVE, tint: '#F3EEFE' }
    : { accent: PRO_TAB_ACTIVE, tint: '#E6EDFC' };
}
