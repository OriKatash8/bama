import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Bell, BellOff, ChevronLeft, ChevronRight } from 'lucide-react-native';
import CommunityDetailsScreen from '../community-details';
import { getDocument } from '@core/firebase/firestore';
import { muteChat, unmuteChat } from '@features/chat/services/chatService';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The community details page: members fold into one expandable card, the mute
 * toggle is visible and says what is actually true, and the header title sits
 * beside a back chevron on the reading-start side.
 */

let mockLanguage: 'he' | 'en' = 'he';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ chatId: 'c1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
// The app wraps everything in ThemeProvider (LIGHT); the bare context default is DARK.
jest.mock('@core/hooks/useTheme', () => {
  const actual = jest.requireActual('@core/hooks/useTheme');
  return { ...actual, useTheme: () => actual.LIGHT };
});
jest.mock('@core/firebase/config', () => ({ db: {}, auth: { currentUser: { uid: 'me' } } }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn((_ref, onNext) => {
    onNext({
      exists: () => true,
      id: 'c1',
      data: () => ({
        type: 'community', name: 'Gaffers Guild', ownerId: 'owner-1', description: 'Lights, stands, cables.',
        members: ['owner-1', 'u2', 'u3'],
      }),
    });
    return () => {};
  }),
}));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn() }));
jest.mock('@features/chat/services/chatService', () => ({
  removeMemberFromGroup: jest.fn(),
  muteChat: jest.fn(() => Promise.resolve()),
  unmuteChat: jest.fn(() => Promise.resolve()),
}));
jest.mock('@features/chat/components/CommunityDiscoveryTab', () => ({ CommunityAvatar: () => null }));
jest.mock('@features/chat/components/CommunityManageModal', () => ({ CommunityManageModal: () => null }));
jest.mock('@utils/confirmDialog', () => ({ confirmDialog: jest.fn() }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLanguage }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { activeMode: string }) => unknown) => s({ activeMode: 'professional' }),
}));

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

const PEOPLE: Record<string, { displayName: string; photoURL: null }> = {
  'owner-1': { displayName: 'Olive Owner', photoURL: null },
  u2: { displayName: 'Ben Boom', photoURL: null },
  u3: { displayName: 'Gil Gaffer', photoURL: null },
};

async function renderScreen({ muted = false } = {}) {
  mockGetDocument.mockImplementation(async (path: string) => {
    if (path === 'users/me') return { mutedChats: muted ? ['c1'] : [] } as never;
    return (PEOPLE[path.replace('users/', '')] ?? null) as never;
  });
  const r = render(<CommunityDetailsScreen />);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return r;
}

// Flattened style of a rendered node; loose on purpose so assertions can read any key.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flat = (node: { props: { style?: unknown } }): Record<string, any> =>
  StyleSheet.flatten(node.props.style as never) ?? {};

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage = 'he';
});

describe('members — one expandable card', () => {
  it('starts collapsed: the header shows the label and count, no member rows', async () => {
    const r = await renderScreen();
    const header = r.getByRole('button', { name: `${he.community_details.members} 3` });
    expect(header.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(r.queryByText('Ben Boom')).toBeNull();
    expect(r.UNSAFE_queryAllByType(ChevronLeft).length + r.UNSAFE_queryAllByType(ChevronRight).length)
      .toBe(1); // only the back chevron — the section chevron is the down/up one
  });

  it('expands in place on tap, keeps the owner badge on the owner, and collapses again', async () => {
    const r = await renderScreen();
    const header = r.getByRole('button', { name: `${he.community_details.members} 3` });
    fireEvent.press(header);
    expect(r.getByRole('button', { name: `${he.community_details.members} 3` }).props.accessibilityState)
      .toEqual(expect.objectContaining({ expanded: true }));
    ['Olive Owner', 'Ben Boom', 'Gil Gaffer'].forEach((n) => expect(r.getByText(n)).toBeTruthy());
    expect(r.getAllByText(he.community_details.owner)).toHaveLength(1);
    expect(r.getByTestId('member-row-owner-1')).toHaveTextContent(`Olive Owner${he.community_details.owner}`, { exact: false });

    fireEvent.press(header);
    expect(r.queryByText('Ben Boom')).toBeNull();
  });

  it('puts a full-width divider under the header and inset dividers only BETWEEN members', async () => {
    const r = await renderScreen();
    fireEvent.press(r.getByRole('button', { name: `${he.community_details.members} 3` }));
    const headerDivider = flat(r.getByTestId('members-header-divider'));
    expect(headerDivider.marginLeft ?? 0).toBe(0);
    expect(headerDivider.marginRight ?? 0).toBe(0);
    // Three members, two gaps: no divider above the first row or below the last.
    expect(r.getAllByTestId('member-divider')).toHaveLength(2);
  });

  it.each([
    ['he', 'marginRight', 'marginLeft'],
    ['en', 'marginLeft', 'marginRight'],
  ] as const)('in %s the member divider is inset on the avatar side (%s)', async (lang, insetSide, flushSide) => {
    mockLanguage = lang;
    const r = await renderScreen();
    const dict = lang === 'he' ? he : en;
    fireEvent.press(r.getByRole('button', { name: `${dict.community_details.members} 3` }));
    const d = flat(r.getAllByTestId('member-divider')[0]);
    expect(d[insetSide]).toBeGreaterThan(0);
    expect(d[flushSide] ?? 0).toBe(0);
    expect(d.height).toBe(0.5);
  });

  it.each([['he', 'row-reverse'], ['en', 'row']] as const)(
    'in %s member rows run %s (avatar on the reading-start side)',
    async (lang, dir) => {
      mockLanguage = lang;
      const r = await renderScreen();
      const dict = lang === 'he' ? he : en;
      fireEvent.press(r.getByRole('button', { name: `${dict.community_details.members} 3` }));
      expect(flat(r.getByTestId('member-row-u2')).flexDirection).toBe(dir);
    },
  );
});

describe('mute toggle', () => {
  it('sits in its card with no "Notifications" title above it', async () => {
    const r = await renderScreen();
    expect(r.getByText(he.community_details.mute_label)).toBeTruthy();
    expect(r.queryByText('התראות')).toBeNull();
  });

  it('when notifications are ON: bell icon, switch off, and the on-state helper text', async () => {
    const r = await renderScreen({ muted: false });
    expect(r.UNSAFE_queryAllByType(Bell)).toHaveLength(1);
    expect(r.UNSAFE_queryAllByType(BellOff)).toHaveLength(0);
    expect(r.getByRole('switch').props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    expect(r.getByText(he.community_details.mute_note_unmuted)).toBeTruthy();
    expect(r.queryByText(he.community_details.mute_note_muted)).toBeNull();
  });

  it('when MUTED: bell-off icon, switch on, and the muted helper text', async () => {
    const r = await renderScreen({ muted: true });
    expect(r.UNSAFE_queryAllByType(BellOff)).toHaveLength(1);
    expect(r.UNSAFE_queryAllByType(Bell)).toHaveLength(0);
    expect(r.getByRole('switch').props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(r.getByText(he.community_details.mute_note_muted)).toBeTruthy();
  });

  it('flipping it still writes through muteChat / unmuteChat, and the copy follows', async () => {
    const r = await renderScreen({ muted: false });
    await act(async () => { fireEvent.press(r.getByRole('switch')); });
    expect(muteChat).toHaveBeenCalledWith('me', 'c1');
    expect(r.getByText(he.community_details.mute_note_muted)).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByRole('switch')); });
    expect(unmuteChat).toHaveBeenCalledWith('me', 'c1');
    expect(r.getByText(he.community_details.mute_note_unmuted)).toBeTruthy();
  });
});

describe('bio', () => {
  it.each([['he', 'right'], ['en', 'left']] as const)(
    'in %s the "About" title aligns %s, like the text under it',
    async (lang, side) => {
      mockLanguage = lang;
      const r = await renderScreen();
      const dict = lang === 'he' ? he : en;
      expect(flat(r.getByText(dict.community_details.about)).textAlign).toBe(side);
      expect(flat(r.getByText('Lights, stands, cables.')).textAlign).toBe(side);
    },
  );
});

describe('header', () => {
  it.each([
    ['he', 'row-reverse', ChevronRight],
    ['en', 'row', ChevronLeft],
  ] as const)('in %s the row runs %s with the back chevron pointing outward', async (lang, dir, Chevron) => {
    mockLanguage = lang;
    const r = await renderScreen();
    const dict = lang === 'he' ? he : en;
    expect(flat(r.getByTestId('details-header')).flexDirection).toBe(dir);
    expect(r.UNSAFE_queryAllByType(Chevron)).toHaveLength(1);
    const title = flat(r.getByText(dict.community_details.header));
    expect(title.fontSize).toBeGreaterThanOrEqual(19);
    expect(title.color).toBe('#0f0f1f'); // theme `text`, not the faint #8890b0
    expect(title.textTransform).toBeUndefined();
  });
});
