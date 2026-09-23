import { renderHook } from '@testing-library/react-native';
import { useModeAccent, CLIENT_TAB_ACTIVE, PRO_TAB_ACTIVE } from '../floatingTabBar';

/**
 * Shared profile parts (tabs, reviews, portfolio) take the mode's accent: a
 * client viewing a professional's profile sees purple, the pro app sees blue.
 */

let mockSegment = '(client)';
jest.mock('expo-router', () => ({ useSegments: () => [mockSegment] }));
let mockActiveMode: string | null = null;
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (sel: (x: { activeMode: string | null }) => unknown) => sel({ activeMode: mockActiveMode }),
}));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: require('react').createContext(undefined) }));

it('client app: purple', () => {
  mockActiveMode = 'client';
  mockSegment = '(client)';
  expect(renderHook(() => useModeAccent()).result.current).toEqual({ accent: CLIENT_TAB_ACTIVE, tint: '#F3EEFE' });
});

it('pro app: blue', () => {
  mockActiveMode = 'professional';
  mockSegment = '(professional)';
  expect(renderHook(() => useModeAccent()).result.current).toEqual({ accent: PRO_TAB_ACTIVE, tint: '#E6EDFC' });
});

it('off the app sections (e.g. /settings), the active mode decides', () => {
  mockSegment = 'settings';
  mockActiveMode = 'client';
  expect(renderHook(() => useModeAccent()).result.current.accent).toBe(CLIENT_TAB_ACTIVE);
  mockActiveMode = 'professional';
  expect(renderHook(() => useModeAccent()).result.current.accent).toBe(PRO_TAB_ACTIVE);
});

/**
 * The ACTIVE MODE decides, not the route's folder.
 *
 * This used to be the other way round, and it made every shared screen that
 * lives in one section lie. `chat/project-details` is the case that found it:
 * there is one file, under (client), and both apps push to it — so a
 * professional opening project details had segments[0] === '(client)' and got
 * the client's purple across the whole page, buttons, icons and outlines.
 *
 * The section is still the fallback for before the mode is known (startup,
 * where activeMode is null). Everywhere the two agree — which is everywhere
 * but a shared route parked in one section — nothing changes.
 */
it('the active mode wins over the route section', () => {
  mockSegment = '(client)';
  mockActiveMode = 'professional';
  expect(renderHook(() => useModeAccent()).result.current).toEqual({ accent: PRO_TAB_ACTIVE, tint: '#E6EDFC' });

  mockSegment = '(professional)';
  mockActiveMode = 'client';
  expect(renderHook(() => useModeAccent()).result.current).toEqual({ accent: CLIENT_TAB_ACTIVE, tint: '#F3EEFE' });
});

it('falls back to the route section before the mode is known', () => {
  mockActiveMode = null;
  mockSegment = '(client)';
  expect(renderHook(() => useModeAccent()).result.current.accent).toBe(CLIENT_TAB_ACTIVE);
  mockSegment = '(professional)';
  expect(renderHook(() => useModeAccent()).result.current.accent).toBe(PRO_TAB_ACTIVE);
});
