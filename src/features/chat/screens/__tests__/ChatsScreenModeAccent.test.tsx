import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { ChatsScreen } from '../ChatsScreen';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { getDoc, onSnapshot } from 'firebase/firestore';
import { CLIENT_TAB_ACTIVE, PRO_TAB_ACTIVE } from '@core/navigation/floatingTabBar';

/**
 * The chat list is shared by both modes; its buttons and the unread badge take
 * the mode's accent, like the tab bar — purple for client, blue for pro.
 */

let mockSegment = '(client)';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => [mockSegment],
  useFocusEffect: () => {},
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({ getDoc: jest.fn(), doc: jest.fn(), updateDoc: jest.fn(), onSnapshot: jest.fn(() => () => {}) }));
jest.mock('../../services/chatService', () => ({ removeMemberFromGroup: jest.fn() }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@features/pricing/services/feesService', () => ({ listenToMyFees: jest.fn() }));
jest.mock('@features/notifications/hooks/useNotifPermissionPrompt', () => ({
  useNotifPermissionPrompt: () => ({ visible: false, dismiss: jest.fn() }),
}));
jest.mock('@features/notifications/components/NotifPermissionBanner', () => ({ NotifPermissionBanner: () => null }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'me' } }),
}));

const chat = {
  id: 'chat-1', type: 'direct', name: 'Dana', members: ['me', 'dana'],
  unreadCount: { me: 3 }, lastMessage: { text: 'hi', timestamp: null },
} as never;

beforeEach(() => {
  (getDoc as jest.Mock).mockImplementation(async () => ({ exists: () => false, data: () => undefined }));
  (listenToMyFees as jest.Mock).mockImplementation((_id: string, cb: (m: Map<string, unknown>) => void) => { cb(new Map()); return () => {}; });
});

async function accentsFor(segment: string) {
  mockSegment = segment;
  const r = render(<ChatsScreen chats={[chat]} />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const selectedChip = r.UNSAFE_root.findAll((n) => n.props.accessibilityState?.selected === true && n.props.style)[0];
  const badge = r.getByText('3').parent!.parent!;
  return {
    chip: StyleSheet.flatten(selectedChip.props.style).backgroundColor,
    badge: StyleSheet.flatten(badge.props.style).backgroundColor,
  };
}

it('client mode: purple', async () => {
  expect(await accentsFor('(client)')).toEqual({ chip: CLIENT_TAB_ACTIVE, badge: CLIENT_TAB_ACTIVE });
});

it('pro mode: blue', async () => {
  expect(await accentsFor('(professional)')).toEqual({ chip: PRO_TAB_ACTIVE, badge: PRO_TAB_ACTIVE });
});

/**
 * The @ pill, beside the unread count rather than instead of it.
 *
 * Two different signals — "someone needs you" and "there is activity" — so the
 * trailing slot goes three-way instead of trash-wins-over-unread. Distinct by
 * glyph and shape (outlined, an "@") rather than by a new colour, which keeps
 * the colour doctrine at the top of ChatsScreen intact.
 */
describe('the mention pill', () => {
  const mention = { chatId: 'chat-1', channelId: null, messageId: 'm1', at: { seconds: 1 } };

  async function renderWith(entries: unknown[]) {
    mockSegment = '(client)';
    (onSnapshot as jest.Mock).mockImplementation((_ref, onNext: (snap: unknown) => void) => {
      onNext({ data: () => ({ pendingMentions: entries }) });
      return () => {};
    });
    const r = render(<ChatsScreen chats={[chat]} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    return r;
  }

  it('shows on a chat with a mention waiting', async () => {
    const r = await renderWith([mention]);
    expect(r.queryByTestId('chat-mention-chat-1')).not.toBeNull();
  });

  it('does not show on a chat without one', async () => {
    const r = await renderWith([{ ...mention, chatId: 'somewhere-else' }]);
    expect(r.queryByTestId('chat-mention-chat-1')).toBeNull();
  });

  it('sits BESIDE the unread count, not instead of it', async () => {
    const r = await renderWith([mention]);
    expect(r.queryByTestId('chat-mention-chat-1')).not.toBeNull();
    // The fixture carries unreadCount { me: 3 }; the number must survive.
    expect(r.queryByText('3')).not.toBeNull();
  });
});
