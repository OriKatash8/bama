import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { arrayRemove, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { createCommunityChat } from '@features/chat/services/chatService';
import { resetUserDirectory } from '@features/admin/people/userDirectory';
import CommunitiesAdmin from '../communities';

/**
 * The communities page in the admin dashboard's design. Firestore is faked at
 * the module boundary: `doc` returns its path, so each write names its target.
 */

let mockLang = 'en';
const mockToast = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
}));
// The ⋮ details read the user document and the (admin-readable) private contact doc.
const mockGetDocument = jest.fn((path: string) => {
  if (path === 'users/m1') return Promise.resolve({ displayName: 'Mia Member', createdAt: { seconds: 1_700_000_000 }, moderation: { status: 'warned', reason: 'Spam' } });
  if (path === 'users/m1/private/contact') return Promise.resolve({ phone: '+972501234567' });
  return Promise.resolve(null);
});
jest.mock('@core/firebase/firestore', () => ({ getDocument: (path: string) => mockGetDocument(path) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: (sel?: (s: object) => unknown) => { const st = { showToast: mockToast }; return sel ? sel(st) : st; } }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
const mockDeleteCommunity = jest.fn((_data: unknown) => Promise.resolve({ ok: true }));
const mockCommunityAction = jest.fn((_data: unknown) => Promise.resolve({ ok: true }));
// Everyone's name and email come from ONE adminListUsers call (m3 has no name on purpose).
const DIRECTORY = [
  { uid: 'o1', displayName: 'Olive Owner', email: 'olive@example.com', disabled: false, createdAt: 1 },
  { uid: 'o2', displayName: 'Sam Owner', email: 'sam@example.com', disabled: false, createdAt: 1 },
  { uid: 'm1', displayName: 'Mia Member', email: 'mia@example.com', disabled: false, createdAt: 1 },
  { uid: 'm2', displayName: 'Ben Member', email: 'ben@example.com', disabled: false, createdAt: 1 },
  { uid: 'm3', displayName: '', email: 'nameless@example.com', disabled: false, createdAt: 1 },
];
const CALM_SUMMARY = {
  moderation: { actions: 0, reportsReceived: 0, reportsFiled: 0 }, projects: { asClient: 0, asProfessional: 0 },
  fees: { records: 0, open: 0, owed: 0, blockedFrom: null }, disputes: { open: 0, resolved: 0 },
  reviews: { received: 0, given: 0, held: 0 }, communities: { owned: 0, member: 0 },
};
const mockListUsers = jest.fn(() => Promise.resolve({ users: DIRECTORY, truncated: false }));
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string) => (data: unknown) =>
    name === 'adminDeleteCommunity' ? mockDeleteCommunity(data)
      : name === 'adminCommunityAction' ? mockCommunityAction(data)
        : name === 'adminListUsers' ? mockListUsers()
          : name === 'adminUserActivity' ? Promise.resolve({ section: 'summary', summary: CALM_SUMMARY })
            : Promise.reject(new Error(`unexpected ${name}`)),
}));
jest.mock('@features/chat/services/chatService', () => ({ createCommunityChat: jest.fn(() => Promise.resolve()) }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db, name: string) => name),
  query: jest.fn((name: string) => name),
  where: jest.fn(),
  orderBy: jest.fn(),
  onSnapshot: jest.fn(),
  updateDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn((_db, ...path: string[]) => path.join('/')),
  arrayRemove: jest.fn((v: string) => ({ arrayRemove: v })),
  Timestamp: class {},
}));

const REQUESTS = [
  { id: 'r1', name: 'Gaffers Guild', description: 'Lighting crews', requesterId: 'q1', requesterName: 'Rona', status: 'pending', createdAt: null },
  // A multi-category request, and a 1.0.x one that carries only the legacy `category`.
  { id: 'r2', name: 'Sony shooters', description: 'Sony users', requesterId: 'q2', requesterName: 'Dan', status: 'pending', createdAt: null,
    categories: ['Video Photographer', 'Still Photographer'], category: 'Video Photographer' },
  { id: 'r3', name: 'Old client', description: 'From 1.0.x', requesterId: 'q3', requesterName: 'Lee', status: 'pending', createdAt: null, category: 'Editor' },
];
const COMMUNITIES = [
  { id: 'c1', name: 'Sound Crew', description: '', ownerId: 'o1', members: ['m1', 'm2'], createdAt: null, status: 'active' },
  { id: 'c2', name: 'Grips Club', description: '', ownerId: 'o2', members: ['m3'], createdAt: null, status: 'suspended' },
];

const snap = onSnapshot as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetUserDirectory();
  mockLang = 'en';
  mockCanGoBack = true;
  snap.mockImplementation((q: string, next: (s: unknown) => void) => {
    const rows = q === 'communityRequests' ? REQUESTS : COMMUNITIES;
    next({ docs: rows.map(({ id, ...data }) => ({ id, data: () => data })) });
    return () => {};
  });
  // The tiles count up on a timer; fake timers keep it from ticking outside act.
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

async function renderPage() {
  const r = render(<CommunitiesAdmin />);
  await act(async () => {});
  return r;
}

it('shows the title in English, aligned left, with a back button to Operations', async () => {
  const r = await renderPage();
  // The page title comes first; the list card's head reuses the word until its own key lands.
  const title = r.getAllByText(en.admin_operations.communities)[0];
  expect(StyleSheet.flatten(title.props.style).textAlign).toBe('left');
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockBack).toHaveBeenCalled();
});

it('back falls back to Operations when there is no history', async () => {
  mockCanGoBack = false;
  const r = await renderPage();
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockReplace).toHaveBeenCalledWith('/admin/operations');
});

it('mirrors in Hebrew: title aligns right, rows run right to left', async () => {
  mockLang = 'he';
  const r = await renderPage();
  const title = r.getAllByText(he.admin_operations.communities)[0];
  expect(StyleSheet.flatten(title.props.style).textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByTestId('request-r1').props.style).flexDirection).toBe('row-reverse');
  expect(within(r.getByTestId('community-c2')).getByText(he.admin_users.status_suspended)).toBeTruthy();
});

it('renders the requests and communities, with owner names, and the stat tiles', async () => {
  const r = await renderPage();
  const req = within(r.getByTestId('request-r1'));
  expect(req.getByText('Gaffers Guild')).toBeTruthy();
  expect(req.getByText('Lighting crews')).toBeTruthy();
  expect(within(r.getByTestId('community-c1')).getByText(/Olive Owner/)).toBeTruthy();
  expect(within(r.getByTestId('community-c2')).getByText(en.admin_users.status_suspended)).toBeTruthy();
  const val = (id: string) => r.getByTestId(`${id}-value`).props.accessibilityLabel;
  expect(val('tile-requests')).toBe('3');
  expect(val('tile-communities')).toBe('2');
  expect(val('tile-suspended')).toBe('1');
  expect(val('tile-members')).toBe('3');
});

// Tiles read as the dashboard's: a footer line under every number.
it('every tile has a footer line under its number', async () => {
  const r = await renderPage();
  expect(within(r.getByTestId('tile-communities')).getByText(en.admin_dashboard.all_time)).toBeTruthy();
  expect(within(r.getByTestId('tile-requests')).getByText(en.communities.pending)).toBeTruthy();
  expect(within(r.getByTestId('tile-suspended')).getByText(`1 ${en.admin_users.status_active}`)).toBeTruthy();
  expect(within(r.getByTestId('tile-members')).getAllByText(/./).length).toBeGreaterThan(2);
});

it('the search filters communities by name or owner', async () => {
  const r = await renderPage();
  fireEvent.changeText(r.getByTestId('community-search'), 'grips');
  expect(r.queryByTestId('community-c1')).toBeNull();
  expect(r.getByTestId('community-c2')).toBeTruthy();
  fireEvent.changeText(r.getByTestId('community-search'), 'olive');
  expect(r.getByTestId('community-c1')).toBeTruthy();
  expect(r.queryByTestId('community-c2')).toBeNull();
  fireEvent.changeText(r.getByTestId('community-search'), 'nothing like it');
  expect(r.getByTestId('communities-no-match')).toBeTruthy();
});

it('approves and rejects a creation request', async () => {
  const r = await renderPage();
  await act(async () => {
    fireEvent.press(r.getByTestId('approve-r1'));
  });
  expect(createCommunityChat).toHaveBeenCalledWith('Gaffers Guild', 'Lighting crews', 'q1', undefined, []);
  expect(updateDoc).toHaveBeenCalledWith('communityRequests/r1', { status: 'approved' });
  await act(async () => {
    fireEvent.press(r.getByTestId('reject-r1'));
  });
  expect(updateDoc).toHaveBeenCalledWith('communityRequests/r1', { status: 'rejected' });
});

// The admin is usually not a member, and the chat rules let only members change
// a community — so all three go through the admin callable, never a client write.
it('suspends / unsuspends, changes the owner and removes a member — through the server', async () => {
  const r = await renderPage();
  await act(async () => { fireEvent.press(r.getByTestId('suspend-c1')); });
  expect(mockCommunityAction).toHaveBeenCalledWith({ communityId: 'c1', action: 'suspend' });
  expect(mockToast).toHaveBeenCalledWith(en.admin_communities.toast_suspended, 'success');
  await act(async () => { fireEvent.press(r.getByTestId('suspend-c2')); });
  expect(mockCommunityAction).toHaveBeenCalledWith({ communityId: 'c2', action: 'unsuspend' });

  fireEvent.changeText(r.getByTestId('owner-input-c1'), ' new-owner ');
  await act(async () => { fireEvent.press(r.getByTestId('owner-set-c1')); });
  expect(mockCommunityAction).toHaveBeenCalledWith({ communityId: 'c1', action: 'set_owner', userId: 'new-owner' });

  expect(r.queryByTestId('members-c1')).toBeNull();
  fireEvent.press(r.getByTestId('members-toggle-c1'));
  expect(r.getByTestId('members-c1')).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByTestId('remove-c1-m2')); });
  expect(mockCommunityAction).toHaveBeenCalledWith({ communityId: 'c1', action: 'remove_member', userId: 'm2' });

  expect(updateDoc).not.toHaveBeenCalledWith(expect.stringMatching(/^chats\//), expect.anything());
});

it('a refused owner change or removal says so', async () => {
  const r = await renderPage();
  mockCommunityAction.mockRejectedValueOnce(new Error('not-found'));
  fireEvent.changeText(r.getByTestId('owner-input-c1'), 'nobody');
  await act(async () => { fireEvent.press(r.getByTestId('owner-set-c1')); });
  expect(mockToast).toHaveBeenCalledWith(en.admin_communities.action_failed, 'error');
});

it('deletes a community only after the destructive confirm — on the server, with everything in it', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const r = await renderPage();
  fireEvent.press(r.getByTestId('delete-c2'));
  expect(mockDeleteCommunity).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  expect(buttons.map((b) => b.style)).toEqual(['cancel', 'destructive']);
  await act(async () => {
    buttons[1].onPress?.();
  });
  expect(mockDeleteCommunity).toHaveBeenCalledWith({ communityId: 'c2' });
  // Never a client delete: rules forbid it, and it would orphan the channels.
  expect(deleteDoc).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(en.admin_communities.toast_deleted, 'success');
  alert.mockRestore();
});

it('delete is a red bin, not a text button, named for screen readers', async () => {
  const r = await renderPage();
  const bin = r.getByTestId('delete-c2');
  expect(within(bin).queryByText(en.admin_communities.delete)).toBeNull();
  expect(bin.props.accessibilityLabel).toBe(`${en.admin_communities.delete} Grips Club`);
});

it('the confirm reads in real words (it used to show raw keys from a block that lacks them)', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const r = await renderPage();
  fireEvent.press(r.getByTestId('delete-c2'));
  const [title, body, buttons] = alert.mock.calls[0] as [string, string, { text: string }[]];
  expect(title).toBe(en.admin_communities.delete_title);
  expect(body).toBe(en.admin_communities.delete_body);
  expect(buttons.map((b) => b.text)).toEqual([en.common.cancel, en.admin_communities.delete]);
  alert.mockRestore();
});

it('cancelling the confirm deletes nothing; a refused delete says so', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const r = await renderPage();
  fireEvent.press(r.getByTestId('delete-c2'));
  await act(async () => { (alert.mock.calls[0][2] as { onPress?: () => void }[])[0].onPress?.(); });
  expect(mockDeleteCommunity).not.toHaveBeenCalled();

  mockDeleteCommunity.mockRejectedValueOnce(new Error('permission-denied'));
  fireEvent.press(r.getByTestId('delete-c2'));
  await act(async () => { (alert.mock.calls[1][2] as { onPress?: () => void }[])[1].onPress?.(); });
  expect(mockToast).toHaveBeenCalledWith(en.admin_communities.delete_failed, 'error');
  alert.mockRestore();
});

// Communities are created with no `status` field. Reading that as "not active"
// showed every real community as suspended.
it('a community with no status is active — shown so, counted so, and suspending it suspends', async () => {
  const fresh = { id: 'c3', name: 'Editors Room', description: '', ownerId: 'o3', members: ['m4'], createdAt: null };
  snap.mockImplementation((q: string, next: (s: unknown) => void) => {
    const rows = q === 'communityRequests' ? REQUESTS : [...COMMUNITIES, fresh];
    next({ docs: rows.map(({ id, ...data }) => ({ id, data: () => data })) });
    return () => {};
  });
  const r = await renderPage();
  expect(within(r.getByTestId('status-c3')).getByText(en.admin_users.status_active)).toBeTruthy();
  expect(within(r.getByTestId('suspend-c3')).getByText(en.admin_users.suspend)).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByTestId('suspend-c3')); });
  expect(mockCommunityAction).toHaveBeenCalledWith({ communityId: 'c3', action: 'suspend' });
});

it('says so when suspending is refused', async () => {
  mockCommunityAction.mockRejectedValueOnce(new Error('permission-denied'));
  const r = await renderPage();
  await act(async () => { fireEvent.press(r.getByTestId('suspend-c1')); });
  expect(mockToast).toHaveBeenCalledWith(en.admin_communities.suspend_failed, 'error');
});

it('shows every category on a request, and approval passes them all through', async () => {
  const r = await renderPage();
  const text = r.getByTestId('request-categories-r2');
  expect(text.props.children).toBe('Videographers · Stills Photographers');
  expect(r.queryByTestId('request-categories-r1')).toBeNull(); // no category at all: no line
  await act(async () => {
    fireEvent.press(r.getByTestId('approve-r2'));
  });
  expect(createCommunityChat).toHaveBeenCalledWith(
    'Sony shooters', 'Sony users', 'q2', undefined, ['Video Photographer', 'Still Photographer'],
  );
});

it('a 1.0.x request with only `category` still shows and approves as one category', async () => {
  const r = await renderPage();
  expect(r.getByTestId('request-categories-r3').props.children).toBe('Editors');
  await act(async () => {
    fireEvent.press(r.getByTestId('approve-r3'));
  });
  expect(createCommunityChat).toHaveBeenCalledWith('Old client', 'From 1.0.x', 'q3', undefined, ['Editor']);
});

describe('people are shown by full name, never by uid, with a ⋮ for more details', () => {
  const openMembers = async (r: Awaited<ReturnType<typeof renderPage>>) => {
    fireEvent.press(r.getByTestId('members-toggle-c1'));
    await act(async () => {});
  };

  it('members are listed by full name (A to Z), and no uid is shown as a label', async () => {
    const r = await renderPage();
    await openMembers(r);
    const list = within(r.getByTestId('members-c1'));
    expect(list.getByText('Ben Member')).toBeTruthy();
    expect(list.getByText('Mia Member')).toBeTruthy();
    expect(list.queryByText('m1')).toBeNull();
    expect(list.queryByText('m2')).toBeNull();
    // sorted by name: Ben before Mia (the DOM order of the member rows)
    const ids = r.UNSAFE_root.findAll((n) => /^member-c1-m\d$/.test(n.props.testID ?? '') && n.props.accessible === false)
      .map((n) => n.props.testID);
    expect([...new Set(ids)]).toEqual(['member-c1-m2', 'member-c1-m1']);
  });

  it('a member with no name shows "Unknown user", not the uid', async () => {
    const r = await renderPage();
    fireEvent.press(r.getByTestId('members-toggle-c2'));
    await act(async () => {});
    const list = within(r.getByTestId('members-c2'));
    expect(list.getByText(en.admin_people.unknown_user)).toBeTruthy();
    expect(list.queryByText('m3')).toBeNull();
  });

  it('the owner is a full name with its own ⋮', async () => {
    const r = await renderPage();
    expect(within(r.getByTestId('owner-line-c1')).getByText('Olive Owner')).toBeTruthy();
    expect(r.getByTestId('owner-more-c1')).toBeTruthy();
  });

  it('⋮ on a member opens their details: name, email, phone, id, standing, and "Open in Users"', async () => {
    const r = await renderPage();
    await openMembers(r);
    await act(async () => { fireEvent.press(r.getByTestId('member-more-c1-m1')); });
    await act(async () => {});
    const d = (suffix: string) => r.getByTestId(`user-details-m1-${suffix}`);
    expect(d('name').props.children).toBe('Mia Member');
    expect(d('email').props.children).toBe('mia@example.com');
    expect(d('uid').props.children).toBe('m1');
    expect(mockGetDocument).toHaveBeenCalledWith('users/m1/private/contact');
    expect(d('standing').props.children).toContain(en.admin_people.standing_warned);
    await act(async () => { fireEvent.press(r.getByTestId('user-details-m1-open-users')); });
    expect(mockPush).toHaveBeenCalledWith('/admin/users?uid=m1');
  });

  it('"Make owner" in the details asks first, then sets the owner by uid on the server', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(
      (...a: unknown[]) => (a[2] as { onPress?: () => void }[])[1].onPress?.(),
    );
    const r = await renderPage();
    await openMembers(r);
    await act(async () => { fireEvent.press(r.getByTestId('member-more-c1-m1')); });
    await act(async () => { fireEvent.press(r.getByTestId('make-owner-c1-m1')); });
    expect(alert).toHaveBeenCalled();
    expect(mockCommunityAction).toHaveBeenCalledWith({ communityId: 'c1', action: 'set_owner', userId: 'm1' });
    expect(mockToast).toHaveBeenCalledWith(en.admin_people.owner_changed.replace('{{name}}', 'Mia Member'), 'success');
    alert.mockRestore();
  });

  it('the current owner has no "Make owner" action', async () => {
    const r = await renderPage();
    fireEvent.press(r.getByTestId('members-toggle-c1'));
    await act(async () => {});
    // o1 is not a member in the fixture, so use the owner line's own details
    await act(async () => { fireEvent.press(r.getByTestId('owner-more-c1')); });
    expect(r.queryByTestId('make-owner-c1-o1')).toBeNull();
  });

  it('removing a member says who by name', async () => {
    const r = await renderPage();
    await openMembers(r);
    await act(async () => { fireEvent.press(r.getByTestId('remove-c1-m1')); });
    expect(mockToast).toHaveBeenCalledWith(en.community_admin.toast_removed.replace('{{name}}', 'Mia Member'), 'success');
    expect(JSON.stringify(mockToast.mock.calls)).not.toContain('"m1"');
  });
});
