import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { CommunityAdminScreen } from '../CommunityAdminScreen';
import {
  approveAllJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  removeCommunityMember,
} from '@features/chat/services/communityMembership';
import * as hooks from '../hooks';

/**
 * The owner dashboard (checkpoint 3: header, title, requests, members).
 * Data hooks are faked at the module boundary; the writes are the membership
 * service, whose own tests pin the Firestore shape.
 */

let mockLang = 'en';
let mockUid = 'owner';
let mockWidth = 400;

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    Stack: { Screen: () => null },
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
    useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  };
});
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { id: string; displayName: string } }) => unknown) =>
    s({ user: { id: mockUid, displayName: 'Olive Owner' } }),
}));
jest.mock('@features/chat/services/communityMembership', () => ({
  approveJoinRequest: jest.fn(() => Promise.resolve(true)),
  approveAllJoinRequests: jest.fn(() => Promise.resolve()),
  rejectJoinRequest: jest.fn(() => Promise.resolve()),
  removeCommunityMember: jest.fn(() => Promise.resolve()),
}));
jest.mock('../hooks', () => ({
  useCommunity: jest.fn(),
  useJoinRequests: jest.fn(),
  useCommunityEvents: jest.fn(() => []),
  useMemberStats: jest.fn(() => ({})),
  useMarketListings: jest.fn(() => []),
  usePeople: jest.fn(() => ({})),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 1, fontScale: 1 }),
}));

const mocked = hooks as jest.Mocked<typeof hooks>;
const E = en.community_admin;
const H = he.community_admin;

const COMMUNITY = { id: 'c1', name: 'Gaffers Guild', ownerId: 'owner', members: ['owner', 'm1', 'm2'], photoURL: null };
const REQUESTS = [
  { userId: 'r1', displayName: 'Noa Bareket', requestedAt: new Date() },
  { userId: 'r2', displayName: 'Itay Segev', requestedAt: new Date() },
];

function seed({ requests = REQUESTS, community = COMMUNITY } = {}) {
  mocked.useCommunity.mockReturnValue({ community, loading: false });
  mocked.useJoinRequests.mockReturnValue(requests);
  mocked.usePeople.mockReturnValue({
    owner: { name: 'Olive Owner', photoURL: null, roleId: null },
    m1: { name: 'Maya Cohen', photoURL: null, roleId: 'editor' },
    m2: { name: 'Adam Peretz', photoURL: null, roleId: 'videographer' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockLang = 'en';
  mockUid = 'owner';
  mockWidth = 400;
  seed();
});
afterEach(() => jest.useRealTimers());

const flush = () => act(async () => { await Promise.resolve(); });

it('puts the join requests first, with their count', () => {
  const r = render(<CommunityAdminScreen chatId="c1" />);
  const cards = r.UNSAFE_root.findAll((n) => ['requests-card', 'members-card'].includes(n.props.testID)).map((n) => n.props.testID);
  expect(cards[0]).toBe('requests-card');
  expect(within(r.getByTestId('requests-count')).getByText('2')).toBeTruthy();
  expect(r.getByText('Noa Bareket')).toBeTruthy();
  expect(r.getByText(E.members_count.replace('{{n}}', '3'))).toBeTruthy();
});

it('sends a non-owner back to the community page and starts no owner listener', () => {
  mockUid = 'm1';
  const r = render(<CommunityAdminScreen chatId="c1" />);
  expect(r.getByTestId('redirect').props.children).toBe('/(client)/chat/community-details?chatId=c1');
  for (const hook of [mocked.useJoinRequests, mocked.useCommunityEvents, mocked.useMemberStats]) {
    expect(hook.mock.calls.every((c) => c[1] === false)).toBe(true);
  }
});

describe('join requests', () => {
  it('approve collapses the row at once, then hides it and says so', async () => {
    const r = render(<CommunityAdminScreen chatId="c1" />);
    await act(async () => { fireEvent.press(r.getByTestId('approve-r1')); });
    expect(approveJoinRequest).toHaveBeenCalledWith('c1', 'r1');
    // Collapsing: still mounted, its buttons off, the count already down.
    expect(r.getByTestId('approve-r1').props.accessibilityState.disabled).toBe(true);
    expect(within(r.getByTestId('requests-count')).getByText('1')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(320); });
    expect(r.queryByTestId('request-r1')).toBeNull();
    expect(within(r.getByTestId('admin-toast')).getByText(E.toast_approved.replace('{{name}}', 'Noa Bareket'))).toBeTruthy();
  });

  it('a failed approve brings the row back and says it failed', async () => {
    (approveJoinRequest as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = render(<CommunityAdminScreen chatId="c1" />);
    await act(async () => { fireEvent.press(r.getByTestId('approve-r1')); });
    await flush();
    await act(async () => { jest.advanceTimersByTime(320); });
    expect(r.getByTestId('request-r1')).toBeTruthy();
    expect(r.getByTestId('approve-r1').props.accessibilityState.disabled).toBe(false);
    expect(within(r.getByTestId('admin-toast')).getByText(E.toast_failed)).toBeTruthy();
  });

  it('reject goes through the service', async () => {
    const r = render(<CommunityAdminScreen chatId="c1" />);
    await act(async () => { fireEvent.press(r.getByTestId('reject-r2')); });
    expect(rejectJoinRequest).toHaveBeenCalledWith('c1', 'r2');
    expect(approveJoinRequest).not.toHaveBeenCalled();
  });

  it('approve all sends every pending id with the current members', async () => {
    const r = render(<CommunityAdminScreen chatId="c1" />);
    await act(async () => { fireEvent.press(r.getByTestId('approve-all')); });
    expect(approveAllJoinRequests).toHaveBeenCalledWith('c1', ['r1', 'r2'], COMMUNITY.members);
  });

  it('shows the written empty state, and approve all is off', () => {
    seed({ requests: [] });
    mockLang = 'he';
    const r = render(<CommunityAdminScreen chatId="c1" />);
    expect(r.getByText('אין בקשות ממתינות. הכול מטופל.')).toBeTruthy();
    expect(r.getByTestId('approve-all').props.accessibilityState.disabled).toBe(true);
  });

  it('lays requests out in two columns from 900px, one below', () => {
    const halfWidth = (r: ReturnType<typeof render>) =>
      StyleSheet.flatten(r.getByTestId('request-col-r1').props.style)?.width;
    expect(halfWidth(render(<CommunityAdminScreen chatId="c1" />))).toBe('100%');
    mockWidth = 1000;
    expect(halfWidth(render(<CommunityAdminScreen chatId="c1" />))).toBe('50%');
  });
});

describe('members', () => {
  it('remove needs a second tap, and the owner has no remove', async () => {
    const r = render(<CommunityAdminScreen chatId="c1" />);
    expect(r.queryByTestId('remove-owner')).toBeNull();
    await act(async () => { fireEvent.press(r.getByTestId('remove-m1')); });
    expect(removeCommunityMember).not.toHaveBeenCalled();
    expect(within(r.getByTestId('remove-m1')).getByText(E.confirm_remove)).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByTestId('remove-m1')); });
    expect(removeCommunityMember).toHaveBeenCalledWith('c1', 'm1', 'owner');
  });

  it('the armed remove resets itself after 4s', async () => {
    const r = render(<CommunityAdminScreen chatId="c1" />);
    await act(async () => { fireEvent.press(r.getByTestId('remove-m1')); });
    await act(async () => { jest.advanceTimersByTime(3999); });
    expect(within(r.getByTestId('remove-m1')).getByText(E.confirm_remove)).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(within(r.getByTestId('remove-m1')).getByText(E.remove)).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByTestId('remove-m1')); });
    expect(removeCommunityMember).not.toHaveBeenCalled();
  });

  it('cancel disarms without removing', async () => {
    const r = render(<CommunityAdminScreen chatId="c1" />);
    await act(async () => { fireEvent.press(r.getByTestId('remove-m1')); });
    await act(async () => { fireEvent.press(r.getByTestId('cancel-remove-m1')); });
    expect(within(r.getByTestId('remove-m1')).getByText(E.remove)).toBeTruthy();
    expect(removeCommunityMember).not.toHaveBeenCalled();
  });

  it('search filters by name or role and says when nothing matches', () => {
    mockLang = 'he';
    const r = render(<CommunityAdminScreen chatId="c1" />);
    fireEvent.changeText(r.getByTestId('member-search'), 'צלם');
    expect(r.getByTestId('member-m2')).toBeTruthy();
    expect(r.queryByTestId('member-m1')).toBeNull();
    fireEvent.changeText(r.getByTestId('member-search'), 'zzz');
    expect(r.getByText('לא נמצאו חברים בחיפוש הזה.')).toBeTruthy();
  });
});

describe('direction', () => {
  const dir = (r: ReturnType<typeof render>, id: string) => StyleSheet.flatten(r.getByTestId(id).props.style).flexDirection;

  it('mirrors the rows in Hebrew', () => {
    mockLang = 'he';
    const r = render(<CommunityAdminScreen chatId="c1" />);
    expect(dir(r, 'request-r1')).toBe('row-reverse');
    expect(dir(r, 'member-m1')).toBe('row-reverse');
    expect(r.getByText(H.title)).toBeTruthy();
  });

  it('keeps them left-to-right in English', () => {
    const r = render(<CommunityAdminScreen chatId="c1" />);
    expect(dir(r, 'request-r1')).toBe('row');
    expect(dir(r, 'member-m1')).toBe('row');
  });
});
