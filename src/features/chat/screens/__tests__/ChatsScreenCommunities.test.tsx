import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ChatsScreen } from '../ChatsScreen';
import en from '@core/i18n/translations/en.json';

/**
 * A community the user is a MEMBER of is listed in the chats tab, in both modes.
 * (Finding communities to join stays in the professional Communities tab.) This is
 * how a client-mode member, who has no Communities tab, reaches the community they
 * joined from an invite link.
 */

let mockSegment = '(client)';
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useSegments: () => [mockSegment],
  useFocusEffect: () => {},
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({ getDoc: jest.fn(), doc: jest.fn(), updateDoc: jest.fn(), onSnapshot: jest.fn(() => () => {}) }));
jest.mock('../../services/chatService', () => ({ removeMemberFromGroup: jest.fn() }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@features/pricing/services/feesService', () => ({ listenToMyFees: jest.fn((_id: string, cb: (m: Map<string, unknown>) => void) => { cb(new Map()); return () => {}; }) }));
jest.mock('@features/notifications/hooks/useNotifPermissionPrompt', () => ({ useNotifPermissionPrompt: () => ({ visible: false, dismiss: jest.fn() }) }));
jest.mock('@features/notifications/components/NotifPermissionBanner', () => ({ NotifPermissionBanner: () => null }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: Object.assign(
    (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
    { getState: () => ({ language: 'en' }) },
  ),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'me' } }),
}));

const community = (over: object = {}) => ({
  id: 'comm-1', type: 'community', name: 'Gaffers Guild', members: ['owner', 'me'], ownerId: 'owner',
  lastMessage: null, unreadCount: {}, ...over,
}) as never;

async function show(chats: unknown[]) {
  const r = render(<ChatsScreen chats={chats as never} />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => { jest.clearAllMocks(); mockSegment = '(client)'; });

describe('a joined community in the chat list', () => {
  it('is listed by name, with no messages yet', async () => {
    const r = await show([community()]);
    expect(r.getByText('Gaffers Guild')).toBeTruthy();
    expect(r.getByTestId('chat-row-comm-1')).toBeTruthy();
  });

  it.each([
    ['(client)', '/(client)/chat/comm-1'],
    ['(professional)', '/(professional)/chat/comm-1'],
  ])('opens in the viewer\'s own mode: %s', async (segment, href) => {
    mockSegment = segment;
    const r = await show([community()]);
    fireEvent.press(r.getByTestId('chat-row-comm-1'));
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('shows its unread count (the server writes unreadCount.<uid> for communities)', async () => {
    const r = await show([community({ unreadCount: { me: 3 } })]);
    expect(r.getByText('3')).toBeTruthy();
  });

  it('sits alongside other chats and is findable by search', async () => {
    const group = { id: 'g-1', type: 'group', name: 'Wedding crew', members: ['me', 'x'], lastMessage: { text: 'hello', timestamp: null } };
    const r = render(<ChatsScreen chats={[group, community()] as never} searchQuery="gaff" />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(r.getByText('Gaffers Guild')).toBeTruthy();
    expect(r.queryByTestId('chat-row-g-1')).toBeNull();
  });

  it('is not a project or a purchase: the Active, Completed and Marketplace filters leave it out', async () => {
    const r = await show([community()]);
    for (const f of [en.chats.filter_open, en.chats.filter_completed, en.chats.filter_marketplace]) {
      await act(async () => { fireEvent.press(r.getByText(f)); });
      expect(r.queryByTestId('chat-row-comm-1')).toBeNull();
    }
  });

  it('shows under the default "All" view', async () => {
    const r = await show([community()]);
    expect(r.getByTestId('chat-row-comm-1')).toBeTruthy();
  });
});
