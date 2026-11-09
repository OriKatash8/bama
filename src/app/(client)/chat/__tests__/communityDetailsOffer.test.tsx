import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import CommunityDetailsScreen from '../community-details';

jest.mock('@features/profile/components/PortfolioViewer', () => ({ PortfolioViewer: () => null }));
import { getDocument } from '@core/firebase/firestore';

/**
 * The owner renames the community and chooses Open / Private from its details
 * page. Owner only: members and strangers see neither control.
 */

let mockUid = 'owner-1';
let mockOffer: { fromUid: string; toUid: string; expiresAtMs: number } | null = null;
const mockShowToast = jest.fn();
const mockRespond = jest.fn(async (..._a: unknown[]) => undefined);

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
      }),
    });
    return () => {};
  }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@features/chat/services/chatService', () => ({
  muteChat: jest.fn(),
  unmuteChat: jest.fn(),
  updateCommunityName: jest.fn(),
  setCommunityJoinMode: jest.fn(),
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
jest.mock('@features/communities/ownerTransfer/ownerTransferService', () => ({
  useOwnerOffer: () => mockOffer,
  respondOwnershipTransfer: (...a: unknown[]) => mockRespond(...a),
  ownerTransferErrorKey: () => 'generic',
}));
jest.mock('@features/communities/invites/inviteService', () => ({ createCommunityInvite: jest.fn() }));
jest.mock('@features/communities/invites/shareInviteLink', () => ({ shareInviteLink: jest.fn() }));

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

async function renderAs(uid: string) {
  mockUid = uid;
  mockGetDocument.mockImplementation(async () => ({ displayName: 'Dana', mutedChats: [] }) as never);
  const r = render(<CommunityDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOffer = { fromUid: 'owner-1', toUid: 'u2', expiresAtMs: Date.now() + 1e6 };
});

describe('a hosting offer on the community page', () => {
  it('the invited member sees Accept and Decline', async () => {
    const r = await renderAs('u2');
    expect(r.getByTestId('host-offer-banner')).toBeTruthy();
  });
  it('nobody else sees the banner (not the host, not another member)', async () => {
    expect((await renderAs('owner-1')).queryByTestId('host-offer-banner')).toBeNull();
    expect((await renderAs('someone-else')).queryByTestId('host-offer-banner')).toBeNull();
  });
  it('no banner when there is no offer', async () => {
    mockOffer = null;
    expect((await renderAs('u2')).queryByTestId('host-offer-banner')).toBeNull();
  });
  it('Accept and Decline answer the offer', async () => {
    const r = await renderAs('u2');
    await act(async () => { fireEvent.press(r.getByTestId('host-offer-accept')); });
    expect(mockRespond).toHaveBeenLastCalledWith('c1', true);
    await act(async () => { fireEvent.press(r.getByTestId('host-offer-decline')); });
    expect(mockRespond).toHaveBeenLastCalledWith('c1', false);
  });
});
