import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import CommunityDetailsScreen from '../community-details';
import { getDocument } from '@core/firebase/firestore';

/**
 * The owner renames the community and chooses Open / Private from its details
 * page. Owner only: members and strangers see neither control.
 */

let mockUid = 'owner-1';
let mockJoinMode: string | undefined;
const mockShowToast = jest.fn();
const mockRename = jest.fn(async (..._a: unknown[]) => undefined);
const mockSetMode = jest.fn(async (..._a: unknown[]) => undefined);

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ chatId: 'c1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@features/chat/components/ChatMediaSection', () => ({ ChatMediaSection: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@core/hooks/useTheme', () => {
  const actual = jest.requireActual('@core/hooks/useTheme');
  return { ...actual, useTheme: () => actual.LIGHT };
});
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { get currentUser() { return { uid: mockUid }; } } }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn((_ref, onNext) => {
    onNext({
      exists: () => true, id: 'c1',
      data: () => ({
        type: 'community', name: 'Gaffers Guild', ownerId: 'owner-1', members: ['owner-1', 'u2'],
        ...(mockJoinMode ? { joinMode: mockJoinMode } : {}),
      }),
    });
    return () => {};
  }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@features/chat/services/chatService', () => ({
  muteChat: jest.fn(),
  unmuteChat: jest.fn(),
  updateCommunityName: (...a: unknown[]) => mockRename(...a),
  setCommunityJoinMode: (...a: unknown[]) => mockSetMode(...a),
}));
jest.mock('@features/chat/components/CommunityDiscoveryTab', () => ({ CommunityAvatar: () => null }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { activeMode: string }) => unknown) => s({ activeMode: 'professional' }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: typeof mockShowToast }) => unknown) => s({ showToast: mockShowToast }),
}));
jest.mock('@features/communities/invites/inviteService', () => ({ createCommunityInvite: jest.fn() }));
jest.mock('@features/communities/invites/shareInviteLink', () => ({ shareInviteLink: jest.fn() }));

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

async function renderAs(uid: string) {
  mockUid = uid;
  mockGetDocument.mockImplementation(async () => ({ displayName: 'X', mutedChats: [] }) as never);
  const r = render(<CommunityDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJoinMode = undefined;
});

describe('who sees the controls', () => {
  it('the owner sees rename and the join-mode card', async () => {
    const r = await renderAs('owner-1');
    expect(r.getByTestId('community-name-edit')).toBeTruthy();
    expect(r.getByTestId('community-join-mode-card')).toBeTruthy();
  });
  it('a member sees neither', async () => {
    const r = await renderAs('u2');
    expect(r.queryByTestId('community-name-edit')).toBeNull();
    expect(r.queryByTestId('community-join-mode-card')).toBeNull();
  });
});

describe('rename', () => {
  it('saves a trimmed new name', async () => {
    const r = await renderAs('owner-1');
    fireEvent.press(r.getByTestId('community-name-edit'));
    fireEvent.changeText(r.getByTestId('community-name-input'), '  Lighting Crew  ');
    await act(async () => { fireEvent.press(r.getByTestId('community-name-save')); });
    expect(mockRename).toHaveBeenCalledWith('c1', 'Lighting Crew');
  });

  it('refuses an empty name without writing', async () => {
    const r = await renderAs('owner-1');
    fireEvent.press(r.getByTestId('community-name-edit'));
    fireEvent.changeText(r.getByTestId('community-name-input'), '   ');
    await act(async () => { fireEvent.press(r.getByTestId('community-name-save')); });
    expect(mockRename).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('cancel leaves the name alone', async () => {
    const r = await renderAs('owner-1');
    fireEvent.press(r.getByTestId('community-name-edit'));
    fireEvent.press(r.getByTestId('community-name-cancel'));
    expect(mockRename).not.toHaveBeenCalled();
    expect(r.queryByTestId('community-name-input')).toBeNull();
  });
});

describe('open / private', () => {
  it('turning the switch on makes the community open', async () => {
    const r = await renderAs('owner-1');
    await act(async () => { fireEvent.press(r.getByRole('switch', { name: 'Open community' })); });
    expect(mockSetMode).toHaveBeenCalledWith('c1', 'open');
  });

  it('turning an open community off makes it private again', async () => {
    mockJoinMode = 'open';
    const r = await renderAs('owner-1');
    await act(async () => { fireEvent.press(r.getByRole('switch', { name: 'Open community' })); });
    expect(mockSetMode).toHaveBeenCalledWith('c1', 'approval');
  });
});
