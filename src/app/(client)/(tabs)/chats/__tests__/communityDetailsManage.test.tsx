import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import CommunityDetailsScreen from '../community-details';
import { getDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The owner manages the community from its details page: "Manage community"
 * takes the place of the category chip under the name, and opens the manage
 * panel. Everyone else still sees the category there. The button no longer
 * lives in the chat header.
 */

let mockUid = 'owner-1';
const mockModal = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ chatId: 'c1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@core/hooks/useTheme', () => {
  const actual = jest.requireActual('@core/hooks/useTheme');
  return { ...actual, useTheme: () => actual.LIGHT };
});
jest.mock('@core/firebase/config', () => ({
  db: {},
  auth: { get currentUser() { return { uid: mockUid }; } },
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn((_ref, onNext) => {
    onNext({
      exists: () => true,
      id: 'c1',
      data: () => ({
        type: 'community', name: 'Gaffers Guild', ownerId: 'owner-1', category: 'Editor',
        members: ['owner-1', 'u2'], photoURL: 'https://example.invalid/p.jpg',
      }),
    });
    return () => {};
  }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@features/chat/services/chatService', () => ({
  removeMemberFromGroup: jest.fn(), muteChat: jest.fn(), unmuteChat: jest.fn(),
}));
jest.mock('@features/chat/components/CommunityDiscoveryTab', () => ({ CommunityAvatar: () => null }));
jest.mock('@features/chat/components/CommunityManageModal', () => ({
  CommunityManageModal: (props: Record<string, unknown>) => { mockModal(props); return null; },
}));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'he' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { activeMode: string }) => unknown) => s({ activeMode: 'professional' }),
}));

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

async function renderAs(uid: string) {
  mockUid = uid;
  mockModal.mockClear();
  // One doc per user: the viewer's own doc answers both the mute lookup and the name.
  const people: Record<string, Record<string, unknown>> = {
    'users/owner-1': { displayName: 'Olive Owner', mutedChats: [] },
    'users/u2': { displayName: 'Ben Boom', mutedChats: [] },
  };
  mockGetDocument.mockImplementation(async (path: string) => (people[path] ?? null) as never);
  const r = render(<CommunityDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

const lastModalProps = () => mockModal.mock.calls[mockModal.mock.calls.length - 1]?.[0] as Record<string, unknown> | undefined;

it('owner: "Manage community" replaces the category under the name', async () => {
  const r = await renderAs('owner-1');
  expect(r.getByRole('button', { name: he.community_details.manage })).toBeTruthy();
  expect(r.queryByText('עורכים')).toBeNull(); // the category label (communityCategoryLabel he, plural)
});

it('owner: the button opens the manage panel with the community', async () => {
  const r = await renderAs('owner-1');
  expect(lastModalProps()?.visible).toBe(false);
  fireEvent.press(r.getByRole('button', { name: he.community_details.manage }));
  expect(lastModalProps()).toEqual(expect.objectContaining({
    visible: true, chatId: 'c1', chatName: 'Gaffers Guild', ownerId: 'owner-1',
    photoURL: 'https://example.invalid/p.jpg', members: ['owner-1', 'u2'],
    memberNames: { 'owner-1': 'Olive Owner', u2: 'Ben Boom' },
  }));
  (lastModalProps()?.onClose as () => void)();
});

it('member: sees the category, no manage button, no panel', async () => {
  const r = await renderAs('u2');
  expect(r.getByText('עורכים')).toBeTruthy();
  expect(r.queryByRole('button', { name: he.community_details.manage })).toBeNull();
  expect(mockModal).not.toHaveBeenCalled();
});

it('has the label in both languages', () => {
  expect(en.community_details.manage).toBe('Manage community');
  expect(he.community_details.manage).toBe('ניהול הקהילה');
});
