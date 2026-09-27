import React from 'react';
import { render } from '@testing-library/react-native';
import ClientChatsScreen from '../index';

/**
 * THE EMPTY CHATS SCREEN SCROLLS.
 *
 * The page used to scroll only when there were chats (`scrollable={hasChats}`),
 * which suited the old small empty block. The animated empty state is taller
 * than the screen, so with no chats its button and link were out of reach.
 */

const mockScreenProps: Record<string, unknown>[] = [];
jest.mock('@components/layout/Screen', () => ({
  Screen: ({ children, ...props }: { children: React.ReactNode }) => { mockScreenProps.push(props); return children; },
}));
let mockChats: { id: string; type: string }[] = [];
let mockLoading = false;
jest.mock('@features/chat/hooks/useUserChats', () => ({ useUserChats: () => ({ chats: mockChats, loading: mockLoading }) }));
jest.mock('@features/chat/screens/ChatsScreen', () => ({ ChatsScreen: () => null }));
jest.mock('@components/empty-state/AnimatedEmptyState', () => ({ AnimatedEmptyState: () => null }));
jest.mock('@components/ui/GradientBand', () => ({ GradientBand: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@components/ui/PageTitle', () => ({ PageTitle: () => null }));
jest.mock('@features/notifications/components/NotifSoftAskModal', () => ({ NotifSoftAskModal: () => null }));
jest.mock('@features/notifications/hooks/useNotifSoftAsk', () => ({ useNotifSoftAsk: () => ({ visible: false }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({
  useTabBarClearance: () => 0, CLIENT_TAB_ACTIVE: '#6D28D9', useModeAccent: () => ({ accent: '#6D28D9', tint: '#fff' }),
}));

const lastScreen = () => mockScreenProps[mockScreenProps.length - 1];

beforeEach(() => { mockScreenProps.length = 0; mockChats = []; mockLoading = false; });

it('with no chats, the page scrolls — the empty state is taller than the screen', () => {
  render(<ClientChatsScreen />);
  expect(lastScreen().scrollable).not.toBe(false);
});

it('with chats, it scrolls as before', () => {
  mockChats = [{ id: 'c1', type: 'dm' }];
  render(<ClientChatsScreen />);
  expect(lastScreen().scrollable).not.toBe(false);
});
