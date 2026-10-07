import React from 'react';
import { act, render } from '@testing-library/react-native';
import { ChatsScreen } from '../ChatsScreen';

/**
 * Communities live in their own tab (professional mode's Communities tab), NOT in the chats list:
 * a joined community never appears here, in either mode.
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

describe('communities are kept out of the chat list', () => {
  it.each(['(client)', '(professional)'])('a joined community is not listed in %s mode', async (segment) => {
    mockSegment = segment;
    const group = { id: 'g-1', type: 'group', name: 'Wedding crew', members: ['me', 'x'], lastMessage: { text: 'hello', timestamp: null } };
    const r = await show([group, community()]);
    expect(r.getByTestId('chat-row-g-1')).toBeTruthy();   // anchor: the list did render
    expect(r.queryByTestId('chat-row-comm-1')).toBeNull();
    expect(r.queryByText('Gaffers Guild')).toBeNull();
  });

  it('not even when searched for by name', async () => {
    const r = render(<ChatsScreen chats={[community()] as never} searchQuery="gaff" />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(r.queryByText('Gaffers Guild')).toBeNull();
  });
});
