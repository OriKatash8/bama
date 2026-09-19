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
  mockSegment = '(client)';
  expect(renderHook(() => useModeAccent()).result.current).toEqual({ accent: CLIENT_TAB_ACTIVE, tint: '#F3EEFE' });
});

it('pro app: blue', () => {
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

it('the route section wins over the active mode', () => {
  mockSegment = '(client)';
  mockActiveMode = 'professional';
  expect(renderHook(() => useModeAccent()).result.current.accent).toBe(CLIENT_TAB_ACTIVE);
});
