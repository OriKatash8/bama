import { renderHook } from '@testing-library/react-native';
import { useModeAccent, CLIENT_TAB_ACTIVE, PRO_TAB_ACTIVE } from '../floatingTabBar';

/**
 * Shared profile parts (tabs, reviews, portfolio) take the mode's accent: a
 * client viewing a professional's profile sees purple, the pro app sees blue.
 */

let mockSegment = '(client)';
jest.mock('expo-router', () => ({ useSegments: () => [mockSegment] }));
jest.mock('expo-router/js-tabs', () => ({ BottomTabBarHeightContext: require('react').createContext(undefined) }));

it('client app: purple', () => {
  mockSegment = '(client)';
  expect(renderHook(() => useModeAccent()).result.current).toEqual({ accent: CLIENT_TAB_ACTIVE, tint: '#F3EEFE' });
});

it('pro app: blue', () => {
  mockSegment = '(professional)';
  expect(renderHook(() => useModeAccent()).result.current).toEqual({ accent: PRO_TAB_ACTIVE, tint: '#E6EDFC' });
});
