import React from 'react';
import { render } from '@testing-library/react-native';
import ClientChatsScreen from '../index';

/**
 * A client whose ONLY chat is a community they joined (from an invite link) must
 * get the chat list, not the "you have no chats" empty state: the community is
 * listed there, and the empty state would hide the only way to reach it.
 */

jest.mock('@components/layout/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }));
let mockChats: { id: string; type: string }[] = [];
jest.mock('@features/chat/hooks/useUserChats', () => ({ useUserChats: () => ({ chats: mockChats, loading: false }) }));
jest.mock('@features/chat/screens/ChatsScreen', () => ({
  ChatsScreen: () => { const { View } = require('react-native'); return <View testID="chats-list" />; },
}));
jest.mock('@components/empty-state/AnimatedEmptyState', () => ({
  AnimatedEmptyState: () => { const { View } = require('react-native'); return <View testID="chats-empty" />; },
}));
jest.mock('@components/ui/GradientBand', () => ({ GradientBand: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@components/ui/PageTitle', () => ({ PageTitle: () => null }));
jest.mock('@features/notifications/components/NotifSoftAskModal', () => ({ NotifSoftAskModal: () => null }));
jest.mock('@features/notifications/hooks/useNotifSoftAsk', () => ({ useNotifSoftAsk: () => ({ visible: false }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({
  useTabBarClearance: () => 0, CLIENT_TAB_ACTIVE: '#6D28D9', useModeAccent: () => ({ accent: '#6D28D9', tint: '#fff' }),
}));

beforeEach(() => { mockChats = []; });

it('only a joined community: shows the list, not the empty state', () => {
  mockChats = [{ id: 'comm-1', type: 'community' }];
  const r = render(<ClientChatsScreen />);
  expect(r.queryByTestId('chats-list')).toBeTruthy();
  expect(r.queryByTestId('chats-empty')).toBeNull();
});

it('no chats at all: still the empty state', () => {
  const r = render(<ClientChatsScreen />);
  expect(r.queryByTestId('chats-empty')).toBeTruthy();
  expect(r.queryByTestId('chats-list')).toBeNull();
});
