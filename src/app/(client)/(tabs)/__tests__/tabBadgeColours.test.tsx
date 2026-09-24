import React from 'react';
import ClientTabsLayout from '../_layout';
import { CLIENT_TAB_ACTIVE } from '@core/navigation/floatingTabBar';

/**
 * EVERY UNREAD MARK ON THE BAR IS THE SAME COLOUR.
 *
 * The Projects badge was the old magenta accent (#cb6ce6) while Chats beside it
 * was the mode's purple, so two marks meaning the same thing — "there is
 * something new here" — sat next to each other in different colours.
 *
 * `Tabs.Screen` is captured rather than rendered: the real navigator wants a
 * root layout, a router and safe-area context, none of which this assertion
 * needs. What is under test is the options object each screen is declared with.
 */

type ScreenOptions = {
  tabBarBadgeStyle?: { backgroundColor?: string };
  tabBarBadge?: unknown;
};
const screens: Record<string, ScreenOptions> = {};

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  Tabs: Object.assign(
    ({ children }: { children: React.ReactNode }) => <>{children}</>,
    {
      // expo-router allows options to be a function of the route; this layout
      // passes plain objects, and both shapes are recorded the same way.
      Screen: ({ name, options }: { name: string; options: ScreenOptions | (() => ScreenOptions) }) => {
        screens[name] = typeof options === 'function' ? options() : options;
        return null;
      },
    },
  ),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s?: (x: Record<string, unknown>) => unknown) => {
    const state = { profileEditing: false, setProfileEditing: jest.fn(), showToast: jest.fn() };
    return s ? s(state) : state;
  },
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } | null }) => unknown) => s({ user: { id: 'client-1' } }),
}));
jest.mock('@core/stores/offersSeenStore', () => ({
  useOffersSeenStore: (s: (x: { lastSeenAt: Record<string, number> }) => unknown) => s({ lastSeenAt: {} }),
  // Non-zero so the badges actually render and carry their style.
  unseenOfferCount: () => 3,
}));
jest.mock('@features/chat/services/chatService', () => ({ listenToUserChats: () => () => {} }));
jest.mock('@features/offers/hooks/usePriceOffers', () => ({ usePriceOffers: () => ({ offers: [] }) }));
jest.mock('@features/offers/hooks/useBundleOffers', () => ({ useBundleOffers: () => ({ bundles: [] }) }));
jest.mock('@components/layout/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('@core/navigation/GlassTabBarBackground', () => ({ GlassTabBarBackground: () => null }));

beforeAll(() => {
  // Rendered outside RNTL: the mocked Tabs.Screen only records its options.
  const { create } = jest.requireActual('react-test-renderer');
  const actualAct = jest.requireActual('react').act ?? ((fn: () => void) => fn());
  actualAct(() => { create(<ClientTabsLayout />); });
});

it('badges Projects in the same purple as Chats, not the old magenta', () => {
  const chats = screens.chats?.tabBarBadgeStyle?.backgroundColor;
  const projects = screens.projects?.tabBarBadgeStyle?.backgroundColor;

  expect(chats).toBe(CLIENT_TAB_ACTIVE);
  expect(projects).toBe(CLIENT_TAB_ACTIVE);
  expect(projects).not.toBe('#cb6ce6');
});

it('gives every badge on the bar the client accent — no stray hardcoded hex', () => {
  const badged = Object.values(screens)
    .map((o) => o?.tabBarBadgeStyle?.backgroundColor)
    .filter((c): c is string => typeof c === 'string');

  expect(badged.length).toBeGreaterThan(0);
  expect(new Set(badged)).toEqual(new Set([CLIENT_TAB_ACTIVE]));
});
