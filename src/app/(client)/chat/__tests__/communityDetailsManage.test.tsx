import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import CommunityDetailsScreen from '../community-details';
import { getDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The owner reaches the community dashboard from its details page: "Dashboard"
 * takes the place of the category chip under the name. Everyone else still
 * sees the category there. The old "Manage community" button (and its panel)
 * is gone from this page.
 */

let mockUid = 'owner-1';
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ chatId: 'c1' }),
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@features/chat/components/ChatMediaSection', () => ({ ChatMediaSection: () => null }));
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
  mockPush.mockClear();
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

it('owner: "Dashboard" replaces the category under the name, and there is no Manage button', async () => {
  const r = await renderAs('owner-1');
  expect(r.getByRole('button', { name: he.community_admin.open_dashboard })).toBeTruthy();
  expect(r.queryByRole('button', { name: he.community_details.manage })).toBeNull();
  expect(r.queryByText('עורכים')).toBeNull(); // the category label (communityCategoryLabel he, plural)
});

it('owner: Dashboard opens the community dashboard', async () => {
  const r = await renderAs('owner-1');
  fireEvent.press(r.getByRole('button', { name: he.community_admin.open_dashboard }));
  // The mocked viewer is in pro mode, so the dashboard opens in the pro stack.
  expect(mockPush).toHaveBeenCalledWith('/(professional)/chat/community-admin?chatId=c1');
});

it('member: sees the category and no dashboard button', async () => {
  const r = await renderAs('u2');
  expect(r.getByText('עורכים')).toBeTruthy();
  expect(r.queryByRole('button', { name: he.community_admin.open_dashboard })).toBeNull();
});

it('has the dashboard label in both languages', () => {
  expect(en.community_admin.open_dashboard).toBe('Dashboard');
  expect(he.community_admin.open_dashboard).toBe('לוח ניהול');
});
