import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { useAuthStore } from '@core/stores/authStore';
import { useSettingsStore } from '@core/stores/settingsStore';
import { useUiStore } from '@core/stores/uiStore';
import { InvitePreviewScreen } from '../InvitePreviewScreen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }), Stack: { Screen: () => null } }));
// Renders an element we can find, carrying the uri it was given.
jest.mock('expo-image', () => ({
  Image: ({ source }: { source: { uri: string } }) => {
    const { View } = require('react-native');
    return <View testID="invite-avatar-image" accessibilityLabel={source?.uri} />;
  },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@core/firebase/config', () => ({ db: {}, auth: {} }));
const mockGet = jest.fn();
jest.mock('../inviteService', () => ({ getCommunityInvite: (x: string) => mockGet(x) }));
const mockJoin = jest.fn(async (_p: unknown) => undefined);
jest.mock('../joinViaInvite', () => ({ requestToJoinViaInvite: (p: unknown) => mockJoin(p) }));

const TOKEN = 'B'.repeat(22);
const ready = (membership: 'none' | 'pending' | 'member') => ({
  exists: true, revoked: false, token: TOKEN, communityId: 'chat1', communityName: 'Gaffers', description: 'Lights', avatarUrl: null, membership,
});
const pv = en.community_invite.preview;

async function open(result: unknown) {
  mockGet.mockResolvedValue(result);
  const r = render(<InvitePreviewScreen tokenOrCode={TOKEN} />);
  await act(async () => {});
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ language: 'en' } as never);
  useAuthStore.setState({ user: { id: 'u1', displayName: 'Dana' } as never, activeMode: 'client' });
  useUiStore.setState({ toasts: [] } as never);
});

describe('states', () => {
  it('a member of nothing sees the community and a join button', async () => {
    const r = await open(ready('none'));
    expect(r.getByTestId('invite-name').props.children).toBe('Gaffers');
    expect(r.getByTestId('invite-join')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(TOKEN);
  });

  it('joining sends the request with the long token and the user, then shows "request sent"', async () => {
    const r = await open(ready('none'));
    await act(async () => { fireEvent.press(r.getByTestId('invite-join')); });
    expect(mockJoin).toHaveBeenCalledWith({ chatId: 'chat1', token: TOKEN, uid: 'u1', displayName: 'Dana' });
    expect(r.getByTestId('invite-pending')).toBeTruthy();
    expect(r.queryByTestId('invite-join')).toBeNull();
  });

  it('a refused request is reported and the button stays', async () => {
    mockJoin.mockRejectedValueOnce({ code: 'permission-denied' });
    const r = await open(ready('none'));
    await act(async () => { fireEvent.press(r.getByTestId('invite-join')); });
    expect(r.getByTestId('invite-join')).toBeTruthy();
    expect(r.queryByTestId('invite-pending')).toBeNull();
  });

  it('an already-pending request shows "request sent", no join button', async () => {
    const r = await open(ready('pending'));
    expect(r.getByTestId('invite-pending')).toBeTruthy();
    expect(r.queryByTestId('invite-join')).toBeNull();
  });

  it('a miss, a revoked invite and a malformed link each get their own empty state', async () => {
    expect((await open({ exists: false })).getByTestId('invite-missing')).toBeTruthy();
    expect((await open({ exists: true, revoked: true })).getByTestId('invite-revoked')).toBeTruthy();
    mockGet.mockClear();
    const r = render(<InvitePreviewScreen tokenOrCode="" />);
    await act(async () => {});
    expect(r.getByTestId('invite-missing')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('a backend error shows its own mapped sentence, never the raw message, and can retry', async () => {
    mockGet.mockRejectedValueOnce({ code: 'functions/failed-precondition', message: 'demo-isolation' });
    const r = render(<InvitePreviewScreen tokenOrCode={TOKEN} />);
    await act(async () => {});
    expect(r.getByText(en.community_invite.errors.demo_isolation)).toBeTruthy();
    expect(r.queryByText('demo-isolation')).toBeNull();
    mockGet.mockResolvedValueOnce(ready('none'));
    await act(async () => { fireEvent.press(r.getByTestId('invite-retry')); });
    expect(r.getByTestId('invite-join')).toBeTruthy();
  });

  it('shows Hebrew copy in Hebrew', async () => {
    useSettingsStore.setState({ language: 'he' } as never);
    const r = await open(ready('none'));
    expect(r.getByText(he.community_invite.preview.join_cta)).toBeTruthy();
  });
});

describe('communities with missing details (null photoURL is the classic crash)', () => {
  const bare = (over: object) => ({ ...ready('none'), ...over });

  it.each([
    ['photo and description both null', { avatarUrl: null, description: null }],
    ['photo and description both ABSENT', { avatarUrl: undefined, description: undefined }],
    ['an empty-string description and photo', { avatarUrl: '', description: '' }],
  ])('%s: renders the name and the join button, with the placeholder icon and no description', async (_name, over) => {
    const r = await open(bare(over));
    expect(r.getByTestId('invite-name').props.children).toBe('Gaffers');
    expect(r.getByTestId('invite-join')).toBeTruthy();
    expect(r.queryByTestId('invite-avatar-image')).toBeNull();
  });

  it('no description line is drawn when there is none', async () => {
    const r = await open(bare({ description: null }));
    expect(r.queryByText('Lights')).toBeNull();
  });

  it('a photo is drawn, from the url the server sent', async () => {
    const r = await open(bare({ avatarUrl: 'https://example.invalid/p.jpg' }));
    expect(r.getByTestId('invite-avatar-image').props.accessibilityLabel).toBe('https://example.invalid/p.jpg');
  });

  it('every state survives missing details: pending and member too', async () => {
    for (const membership of ['pending', 'member'] as const) {
      const r = await open(bare({ membership, avatarUrl: null, description: null }));
      expect(r.getByTestId('invite-name')).toBeTruthy();
      r.unmount();
    }
  });

  it('a community with no name at all does not crash (empty title)', async () => {
    const r = await open(bare({ communityName: '', avatarUrl: null, description: null }));
    expect(r.getByTestId('invite-join')).toBeTruthy();
  });
});

describe('leaving the screen always names a route group (client + professional)', () => {
  it.each([
    ['client', '/(client)/chat/chat1', '/(client)/(tabs)/home'],
    ['professional', '/(professional)/chat/chat1', '/(professional)/(tabs)/dashboard'],
  ] as const)('%s mode', async (mode, communityHref, homeHref) => {
    useAuthStore.setState({ activeMode: mode });
    const member = await open(ready('member'));
    fireEvent.press(member.getByTestId('invite-open'));
    expect(mockReplace).toHaveBeenLastCalledWith(communityHref);
    member.unmount();

    const pending = await open(ready('pending'));
    fireEvent.press(pending.getByTestId('invite-home'));
    expect(mockReplace).toHaveBeenLastCalledWith(homeHref);
    for (const [href] of mockReplace.mock.calls) expect(href).not.toMatch(/^\/chat\//);
  });
});

it('no copy key is missing in either language', () => {
  const keys = Object.keys(pv);
  expect(Object.keys(he.community_invite.preview).sort()).toEqual(keys.sort());
});
