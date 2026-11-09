import React from 'react';
import { render, fireEvent, act, within } from '@testing-library/react-native';
import CommunityDetailsScreen from '../community-details';
import { getDocument } from '@core/firebase/firestore';
import { updateCommunityCategories } from '@features/chat/services/chatService';
import en from '@core/i18n/translations/en.json';

/**
 * A community can carry several categories. Everyone sees them all as chips under the
 * name; the owner edits them in their own card (next to join mode), one or more, every
 * tap saving at once. An older doc with only the legacy `category` reads as one.
 */

jest.mock('@features/profile/components/PortfolioViewer', () => ({ PortfolioViewer: () => null }));

let mockUid = 'owner-1';
let mockDoc: Record<string, unknown> = {};
const mockToast = jest.fn();

jest.mock('@features/communities/ownerTransfer/ownerTransferService', () => ({
  useOwnerOffer: () => null,
  respondOwnershipTransfer: jest.fn(),
  ownerTransferErrorKey: () => 'generic',
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ chatId: 'c1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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
    onNext({ exists: () => true, id: 'c1', data: () => mockDoc });
    return () => {};
  }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@features/chat/services/chatService', () => ({
  removeMemberFromGroup: jest.fn(), muteChat: jest.fn(), unmuteChat: jest.fn(),
  setCommunityJoinMode: jest.fn(), updateCommunityName: jest.fn(),
  updateCommunityCategories: jest.fn(() => Promise.resolve()),
}));
jest.mock('@features/communities/invites/inviteService', () => ({ createCommunityInvite: jest.fn() }));
jest.mock('@features/chat/components/CommunityDiscoveryTab', () => ({ CommunityAvatar: () => null }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: typeof mockToast }) => unknown) => s({ showToast: mockToast }),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { activeMode: string }) => unknown) => s({ activeMode: 'professional' }),
}));

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockUpdate = updateCommunityCategories as jest.MockedFunction<typeof updateCommunityCategories>;

const base = { type: 'community', name: 'Sony shooters', ownerId: 'owner-1', members: ['owner-1', 'u2'] };

async function renderAs(uid: string, doc: Record<string, unknown>) {
  mockUid = uid;
  mockDoc = { ...base, ...doc };
  mockUpdate.mockClear();
  mockToast.mockClear();
  mockGetDocument.mockImplementation(async () => ({ displayName: 'Someone', mutedChats: [] }) as never);
  const r = render(<CommunityDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

it('a member sees every category as a chip', async () => {
  const r = await renderAs('u2', { categories: ['Video Photographer', 'Still Photographer'], category: 'Video Photographer' });
  const chips = within(r.getByTestId('community-categories'));
  expect(chips.getByText('Videographers')).toBeTruthy();
  expect(chips.getByText('Stills Photographers')).toBeTruthy();
  expect(r.queryByTestId('community-categories-card')).toBeNull(); // no editor for a member
});

it('an older doc with only `category` shows that one', async () => {
  const r = await renderAs('u2', { category: 'Editor' });
  const chips = within(r.getByTestId('community-categories'));
  expect(chips.getByText('Editors')).toBeTruthy();
});

it('a community with no category shows no chips', async () => {
  const r = await renderAs('u2', {});
  expect(r.queryByTestId('community-categories')).toBeNull();
});

it('the owner sees the editor with the current categories checked', async () => {
  const r = await renderAs('owner-1', { categories: ['Editor', 'Video Photographer'], category: 'Editor' });
  expect(r.getByTestId('community-categories-card')).toBeTruthy();
  expect(r.getByTestId('owner-category-Editor').props.accessibilityState.checked).toBe(true);
  expect(r.getByTestId('owner-category-Video Photographer').props.accessibilityState.checked).toBe(true);
  expect(r.getByTestId('owner-category-Lighting Tech').props.accessibilityState.checked).toBe(false);
});

it('the owner adds a category — saved at once, with no maximum', async () => {
  const r = await renderAs('owner-1', { categories: ['Editor'], category: 'Editor' });
  await act(async () => { fireEvent.press(r.getByTestId('owner-category-Lighting Tech')); });
  expect(mockUpdate).toHaveBeenCalledWith('c1', ['Editor', 'Lighting Tech']);
});

it('the owner removes one of several', async () => {
  const r = await renderAs('owner-1', { categories: ['Editor', 'Video Photographer'], category: 'Editor' });
  await act(async () => { fireEvent.press(r.getByTestId('owner-category-Editor')); });
  expect(mockUpdate).toHaveBeenCalledWith('c1', ['Video Photographer']);
});

it('the last category cannot be removed', async () => {
  const r = await renderAs('owner-1', { categories: ['Editor'], category: 'Editor' });
  await act(async () => { fireEvent.press(r.getByTestId('owner-category-Editor')); });
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(en.community_details.categories_min, 'error');
});

it('a legacy doc: the owner edit starts from its single category', async () => {
  const r = await renderAs('owner-1', { category: 'Editor' });
  await act(async () => { fireEvent.press(r.getByTestId('owner-category-Sound Recordist')); });
  expect(mockUpdate).toHaveBeenCalledWith('c1', ['Editor', 'Sound Recordist']);
});

it('a failed save says so', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const r = await renderAs('owner-1', { categories: ['Editor'], category: 'Editor' });
  mockUpdate.mockRejectedValueOnce(new Error('denied'));
  await act(async () => { fireEvent.press(r.getByTestId('owner-category-Lighting Tech')); });
  expect(mockToast).toHaveBeenCalledWith(en.community_details.categories_failed, 'error');
});
