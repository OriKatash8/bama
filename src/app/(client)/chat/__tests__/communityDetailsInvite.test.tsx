import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import CommunityDetailsScreen from '../community-details';
import { getDocument } from '@core/firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The owner shares the community's invite link from its details page. Owner only:
 * a member (or anyone else) does not see the row.
 */

let mockUid = 'owner-1';
let mockLang = 'he';
const mockShowToast = jest.fn();
const mockCreate = jest.fn();
const mockShare = jest.fn();

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
      data: () => ({ type: 'community', name: 'Gaffers Guild', ownerId: 'owner-1', members: ['owner-1', 'u2'] }),
    });
    return () => {};
  }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@features/chat/services/chatService', () => ({ removeMemberFromGroup: jest.fn(), muteChat: jest.fn(), unmuteChat: jest.fn() }));
jest.mock('@features/chat/components/CommunityDiscoveryTab', () => ({ CommunityAvatar: () => null }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { activeMode: string }) => unknown) => s({ activeMode: 'professional' }),
}));
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (s: (x: { showToast: typeof mockShowToast }) => unknown) => s({ showToast: mockShowToast }),
}));
jest.mock('@features/communities/invites/inviteService', () => ({ createCommunityInvite: (id: string) => mockCreate(id) }));
jest.mock('@features/communities/invites/shareInviteLink', () => ({ shareInviteLink: (p: unknown) => mockShare(p) }));

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const URL_ = 'https://bama-af0a0.web.app/c/' + 'T'.repeat(22);

async function renderAs(uid: string) {
  mockUid = uid;
  mockGetDocument.mockImplementation(async () => ({ displayName: 'X', mutedChats: [] }) as never);
  const r = render(<CommunityDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'he';
  mockCreate.mockResolvedValue({ token: 'T'.repeat(22), shortCode: 'ABC234', url: URL_ });
  mockShare.mockResolvedValue('shared');
});

const press = async (r: Awaited<ReturnType<typeof renderAs>>) => {
  await act(async () => { fireEvent.press(r.getByTestId('share-community-invite')); });
};

describe('who sees the row', () => {
  it('the owner does', async () => {
    const r = await renderAs('owner-1');
    expect(r.getByRole('button', { name: he.community_invite.share_label })).toBeTruthy();
  });
  it('a member does not', async () => {
    const r = await renderAs('u2');
    expect(r.queryByTestId('share-community-invite')).toBeNull();
  });
  it('a stranger does not', async () => {
    const r = await renderAs('someone-else');
    expect(r.queryByTestId('share-community-invite')).toBeNull();
  });
});

describe('sharing', () => {
  it('creates the invite for THIS community and shares the message with the link, in the owner\'s language', async () => {
    const r = await renderAs('owner-1');
    await press(r);
    expect(mockCreate).toHaveBeenCalledWith('c1');
    expect(mockShare).toHaveBeenCalledWith({
      title: he.community_invite.share_title.replace('{{name}}', 'Gaffers Guild'),
      message: he.community_invite.share_message.replace('{{name}}', 'Gaffers Guild').replace('{{url}}', URL_),
      url: URL_,
    });
    expect(mockShare.mock.calls[0][0].message).toContain(URL_);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('English owner gets the English message', async () => {
    mockLang = 'en';
    const r = await renderAs('owner-1');
    await press(r);
    expect(mockShare.mock.calls[0][0].message).toBe(`Join the Gaffers Guild community on BAMA: ${URL_}`);
  });

  it('when the link was copied (web fallback), says so', async () => {
    mockShare.mockResolvedValue('copied');
    const r = await renderAs('owner-1');
    await press(r);
    expect(mockShowToast).toHaveBeenCalledWith(he.community_invite.link_copied, 'success');
  });

  it('closing the sheet says nothing', async () => {
    mockShare.mockResolvedValue('cancelled');
    const r = await renderAs('owner-1');
    await press(r);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('neither share nor clipboard available: an error toast, not silence', async () => {
    mockShare.mockResolvedValue('unsupported');
    const r = await renderAs('owner-1');
    await press(r);
    expect(mockShowToast).toHaveBeenCalledWith(he.community_invite.errors.generic, 'error');
  });
});

describe('failures are real sentences, never the raw function error', () => {
  it('unverified email: the exact Hebrew sentence', async () => {
    mockCreate.mockRejectedValue({ code: 'functions/failed-precondition', message: 'email_not_verified' });
    const r = await renderAs('owner-1');
    await press(r);
    expect(mockShowToast).toHaveBeenCalledWith('אמת את כתובת האימייל שלך כדי ליצור קישור הזמנה', 'error');
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('the same failure in English', async () => {
    mockLang = 'en';
    mockCreate.mockRejectedValue({ code: 'functions/failed-precondition', message: 'email_not_verified' });
    const r = await renderAs('owner-1');
    await press(r);
    expect(mockShowToast).toHaveBeenCalledWith(en.community_invite.errors.email_not_verified, 'error');
  });

  it('a share-sheet failure is reported too', async () => {
    mockShare.mockRejectedValue(new Error('boom'));
    const r = await renderAs('owner-1');
    await press(r);
    expect(mockShowToast).toHaveBeenCalledWith(he.community_invite.errors.generic, 'error');
  });
});

it('a second tap while the first is in flight does nothing', async () => {
  let release!: (v: unknown) => void;
  mockCreate.mockReturnValue(new Promise((res) => { release = res; }));
  const r = await renderAs('owner-1');
  await act(async () => { fireEvent.press(r.getByTestId('share-community-invite')); });
  await act(async () => { fireEvent.press(r.getByTestId('share-community-invite')); });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  await act(async () => { release({ token: 'T'.repeat(22), shortCode: 'ABC234', url: URL_ }); });
  expect(mockShare).toHaveBeenCalledTimes(1);
  // ...and the row works again afterwards.
  mockCreate.mockResolvedValue({ token: 'T'.repeat(22), shortCode: 'ABC234', url: URL_ });
  await press(r);
  expect(mockCreate).toHaveBeenCalledTimes(2);
});
