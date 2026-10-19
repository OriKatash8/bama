/**
 * The tabs layouts' real PanResponder config (captured from PanResponder.create): a drag that
 * would switch tab is refused while a strip holds the swipe lock, and unchanged otherwise.
 */
import React from 'react';
import { PanResponder, Dimensions } from 'react-native';
import { usePagerSwipeLock } from '../pagerSwipeLock';

type Config = {
  onMoveShouldSetPanResponder: (e: unknown, gs: { moveX: number; dx: number; dy: number }) => boolean;
  onPanResponderRelease: (e: unknown, gs: { dx: number }) => void;
};

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  usePathname: () => '/(professional)/(tabs)/marketplace',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: mockNavigate }),
  Tabs: Object.assign(({ children }: { children: React.ReactNode }) => <>{children}</>, { Screen: () => null }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s?: (x: Record<string, unknown>) => unknown) => {
    const state = { profileEditing: false, isDark: false, setProfileEditing: jest.fn(), showToast: jest.fn() };
    return s ? s(state) : state;
  },
}));
jest.mock('@core/stores/settingsStore', () => ({ useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }) }));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: Record<string, unknown>) => unknown) => s({ user: { id: 'u1' }, proProfileCompleted: true }),
}));
jest.mock('@core/stores/offersSeenStore', () => ({
  useOffersSeenStore: (s: (x: { lastSeenAt: Record<string, number> }) => unknown) => s({ lastSeenAt: {} }),
  unseenOfferCount: () => 0,
}));
jest.mock('@features/chat/services/chatService', () => ({ listenToUserChats: () => () => {} }));
jest.mock('@features/offers/hooks/usePriceOffers', () => ({ usePriceOffers: () => ({ offers: [] }) }));
jest.mock('@features/offers/hooks/useBundleOffers', () => ({ useBundleOffers: () => ({ bundles: [] }) }));
jest.mock('@components/layout/AppHeader', () => ({ AppHeader: () => null }));
jest.mock('@core/navigation/GlassTabBarBackground', () => ({ GlassTabBarBackground: () => null }));

import ProfessionalTabsLayout from '../../../app/(professional)/(tabs)/_layout';
import ClientTabsLayout from '../../../app/(client)/(tabs)/_layout';

const WIDTH = 400;
const captured: Record<string, Config> = {};

function mount(name: string, Layout: React.ComponentType) {
  const spy = jest.spyOn(PanResponder, 'create').mockImplementation(((c: Config) => {
    captured[name] = c;
    return { panHandlers: {} };
  }) as never);
  const { create } = jest.requireActual('react-test-renderer');
  const act = jest.requireActual('react').act ?? ((fn: () => void) => fn());
  act(() => { create(<Layout />); });
  spy.mockRestore();
}

beforeAll(() => {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: WIDTH, height: 800, scale: 2, fontScale: 1 });
  mount('pro', ProfessionalTabsLayout);
  mount('client', ClientTabsLayout);
});
beforeEach(() => {
  usePagerSwipeLock.getState().unlock();
  mockNavigate.mockClear();
});

// A swipe that starts 10px from the left edge and moves 60px right (|dx| > 20, mostly horizontal).
const edgeSwipe = { moveX: 70, dx: 60, dy: 4 };
// The same drag starting mid-screen.
const midSwipe = { moveX: 260, dx: 60, dy: 4 };

describe.each(['pro', 'client'])('%s tabs layout', (name) => {
  const cfg = () => captured[name];

  it('still claims a horizontal edge swipe when no strip is held', () => {
    expect(cfg().onMoveShouldSetPanResponder({}, edgeSwipe)).toBe(true);
  });

  it('still ignores a swipe that starts mid-screen (unchanged behaviour)', () => {
    expect(cfg().onMoveShouldSetPanResponder({}, midSwipe)).toBe(false);
  });

  it('refuses the same edge swipe while a strip holds the lock', () => {
    usePagerSwipeLock.getState().lock();
    expect(cfg().onMoveShouldSetPanResponder({}, edgeSwipe)).toBe(false);
  });

  it('claims again once the strip lets go', () => {
    usePagerSwipeLock.getState().lock();
    usePagerSwipeLock.getState().unlock();
    expect(cfg().onMoveShouldSetPanResponder({}, edgeSwipe)).toBe(true);
  });
});

it('a released swipe still changes tab (pro marketplace -> chats)', () => {
  captured.pro.onPanResponderRelease({}, { dx: -120 });
  expect(mockNavigate).toHaveBeenCalledWith('/(professional)/(tabs)/chats');
});
