import React from 'react';
import { StyleSheet } from 'react-native';
import { render, act } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { ChatsScreen } from '../ChatsScreen';
import { listenToMyFees } from '@features/pricing/services/feesService';
import { getDoc } from 'firebase/firestore';

/**
 * EACH CHAT NEEDS ROOM UNDER ITS MESSAGE LINE.
 *
 * The rows were padded 10 top and bottom, which put the message text almost on
 * the separator beneath it and made the list read as one block. The padding
 * also has to actually govern the row's height: `minHeight: 64` was set back
 * when 44 of avatar plus 2×10 came to exactly 64, so a padding bump that stayed
 * under that floor would change the style and nothing else.
 */

const AVATAR = 44;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSegments: () => ['(client)'],
  useFocusEffect: () => {},
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
jest.mock('firebase/firestore', () => ({ getDoc: jest.fn(), doc: jest.fn() }));
jest.mock('../../services/chatService', () => ({ removeMemberFromGroup: jest.fn() }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@features/pricing/services/feesService', () => ({ listenToMyFees: jest.fn() }));
jest.mock('@features/notifications/hooks/useNotifPermissionPrompt', () => ({
  useNotifPermissionPrompt: () => ({ visible: false, dismiss: jest.fn() }),
}));
jest.mock('@features/notifications/components/NotifPermissionBanner', () => ({
  NotifPermissionBanner: () => null,
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string } }) => unknown) => s({ user: { id: 'client-1' } }),
}));

const mockGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockListenToMyFees = listenToMyFees as jest.MockedFunction<typeof listenToMyFees>;

const chats = [
  { id: 'chat-1', type: 'group', projectId: 'p1', name: 'Three-camera shoot', members: ['client-1', 'pro-1'], lastMessage: { text: 'On my way', timestamp: null } },
  { id: 'chat-2', type: 'group', projectId: 'p2', name: 'Rooftop launch film', members: ['client-1', 'pro-2'], lastMessage: { text: 'Sounds good', timestamp: null } },
] as never;

async function renderList() {
  mockGetDoc.mockImplementation(async () => ({
    exists: () => true,
    data: () => ({ status: 'in_progress', clientId: 'client-1', professionalIds: ['pro-1'], reviewsCompleted: true }),
  }) as never);
  mockListenToMyFees.mockImplementation((_id, cb) => { cb(new Map()); return () => {}; });
  const r = render(<ChatsScreen chats={chats} />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

/** The row's style is a function of press state, so it is resolved unpressed. */
function rowStyle(node: ReactTestInstance) {
  const style = node.props.style as unknown;
  const resolved = typeof style === 'function' ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  return StyleSheet.flatten(resolved as never) as { paddingVertical?: number; minHeight?: number };
}

beforeEach(() => jest.clearAllMocks());

it('leaves room under the message line, more than the old 10', async () => {
  const r = await renderList();

  const pad = rowStyle(r.getByTestId('chat-row-chat-1')).paddingVertical;
  expect(pad).toBeGreaterThan(10);
});

it('is not swallowed by the row minHeight', async () => {
  const r = await renderList();

  const { paddingVertical, minHeight } = rowStyle(r.getByTestId('chat-row-chat-1'));
  // The avatar is the tallest thing in the row, so this sum IS the row height —
  // unless minHeight is taller, in which case the extra padding buys nothing.
  expect(AVATAR + 2 * (paddingVertical ?? 0)).toBeGreaterThan(minHeight ?? 0);
});
