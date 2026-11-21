import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import UsersAdmin from '../users';

/**
 * Admin Users: a list of every account — name and email only — reached from the
 * dashboard's "total users" tile (it is no longer a tab). Tapping one opens all
 * of their details: standing, moderation reason, actions and history.
 */

let mockLang = 'en';
const mockToast = jest.fn();
const mockCallables: Record<string, jest.Mock> = {
  adminListUsers: jest.fn(),
  moderateUser: jest.fn(),
  sendSystemMessage: jest.fn(),
  adminUserActivity: jest.fn(),
};

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
let mockUidParam: string | undefined;
let mockSectionParam: string | undefined;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ uid: mockUidParam, section: mockSectionParam }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: (sel?: (s: object) => unknown) => { const st = { showToast: mockToast }; return sel ? sel(st) : st; } }));
jest.mock('firebase/firestore', () => ({ where: jest.fn(() => 'where') }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(), queryDocuments: jest.fn() }));
jest.mock('@core/firebase/functions', () => ({
  // Resolved at call time: the page builds its callables at import.
  callFunction: (name: string) => (args: unknown) => mockCallables[name](args),
}));

const E = en.admin_users;
const H = he.admin_users;
const getDoc = getDocument as jest.Mock;
const queryDocs = queryDocuments as jest.Mock;

const LIST = [
  { uid: 'u2', displayName: 'Avi Cohen', email: 'avi@example.com', disabled: false, createdAt: 1 },
  { uid: 'u1', displayName: 'Noa Levi', email: 'noa@example.com', disabled: false, createdAt: 1 },
  { uid: 'u3', displayName: '', email: 'nameless@example.com', disabled: true, createdAt: 1 },
];
const USER = {
  id: 'u1',
  displayName: 'Noa Levi',
  createdAt: { seconds: 1_700_000_000 },
  moderation: { status: 'warned', reason: 'Spam in chat', actorName: 'Dana Admin', at: { seconds: 1_700_100_000 } },
};
// What adminUserActivity returns: the moderation tab is the old "history", plus reports.
const MODERATION = [
  { kind: 'action', id: 'a1', at: 1_700_100_000_000, action: 'warn', reason: 'Spam in chat', actorName: 'Dana Admin', reportId: null },
  { kind: 'action', id: 'a2', at: 1_600_000_000_000, action: 'suspend', reason: 'Older', actorName: 'Eli Admin', reportId: null },
];
const SUMMARY = {
  moderation: { actions: 2, reportsReceived: 1, reportsFiled: 0 }, projects: { asClient: 3, asProfessional: 4 },
  fees: { records: 5, open: 1, owed: 90, blockedFrom: null }, disputes: { open: 1, resolved: 2 },
  reviews: { received: 2, given: 1, held: 0 }, communities: { owned: 0, member: 2 },
};
const activityFor = ({ section }: { section: string }) =>
  Promise.resolve(section === 'summary'
    ? { section, summary: SUMMARY }
    : { section, items: section === 'moderation' ? MODERATION : [], nextCursor: null, total: section === 'moderation' ? 2 : 0, truncated: false });

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockUidParam = undefined;
  mockSectionParam = undefined;
  mockRouter.canGoBack.mockReturnValue(true);
  mockCallables.adminListUsers.mockResolvedValue({ users: LIST, truncated: false });
  mockCallables.moderateUser.mockResolvedValue({ success: true, actionId: 'x' });
  mockCallables.sendSystemMessage.mockResolvedValue({ chatId: 'c' });
  getDoc.mockResolvedValue(USER);
  mockCallables.adminUserActivity.mockImplementation(activityFor);
});

async function renderPage() {
  const r = render(<UsersAdmin />);
  await act(async () => {});
  return r;
}

async function openUser(r: ReturnType<typeof render>, uid = 'u1') {
  await act(async () => {
    fireEvent.press(r.getByTestId(`user-row-${uid}`));
  });
}

describe('the page', () => {
  it('shows the title and subtitle in English, aligned left', async () => {
    const r = await renderPage();
    expect(r.getByText(E.title)).toBeTruthy();
    expect(r.getByText(E.greeting)).toBeTruthy();
    expect(StyleSheet.flatten(r.getByText(E.title).props.style).textAlign).toBe('left');
  });

  it('is no longer a tab, so it has a back button to the dashboard', async () => {
    const r = await renderPage();
    fireEvent.press(r.getByTestId('admin-back'));
    expect(mockRouter.back).toHaveBeenCalled();
    mockRouter.canGoBack.mockReturnValue(false);
    fireEvent.press(r.getByTestId('admin-back'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/admin');
  });

  it('mirrors in Hebrew: title aligns right, rows run right to left', async () => {
    mockLang = 'he';
    const r = await renderPage();
    expect(StyleSheet.flatten(r.getByText(H.title).props.style).textAlign).toBe('right');
    expect(StyleSheet.flatten(r.getByTestId('user-row-u1').props.style).flexDirection).toBe('row-reverse');
    await openUser(r);
    expect(StyleSheet.flatten(r.getByTestId('activity-moderation-a1').props.style).flexDirection).toBe('row-reverse');
    expect(within(r.getByTestId('user-card')).getByText(H.status_warned)).toBeTruthy();
  });
});

describe('the list', () => {
  it('lists every user with their name and email, and nothing else', async () => {
    const r = await renderPage();
    expect(mockCallables.adminListUsers).toHaveBeenCalledWith({});
    const list = within(r.getByTestId('users-list'));
    expect(list.getByText('Noa Levi')).toBeTruthy();
    expect(list.getByText('noa@example.com')).toBeTruthy();
    expect(list.getByText('Avi Cohen')).toBeTruthy();
    expect(list.getByText('avi@example.com')).toBeTruthy();
    // No name: listed by its email, with the "no name" label.
    expect(within(r.getByTestId('user-row-u3')).getByText(E.unnamed)).toBeTruthy();
    expect(list.queryByText(E.status_warned)).toBeNull();
    expect(r.getByTestId('users-count')).toBeTruthy();
  });

  it('searches by name or email as you type', async () => {
    const r = await renderPage();
    fireEvent.changeText(r.getByTestId('users-search'), 'NOA');
    expect(r.getByTestId('user-row-u1')).toBeTruthy();
    expect(r.queryByTestId('user-row-u2')).toBeNull();
    fireEvent.changeText(r.getByTestId('users-search'), 'avi@');
    expect(r.getByTestId('user-row-u2')).toBeTruthy();
    expect(r.queryByTestId('user-row-u1')).toBeNull();
    // A user with no name is found by email.
    fireEvent.changeText(r.getByTestId('users-search'), 'nameless');
    expect(r.getByTestId('user-row-u3')).toBeTruthy();
    fireEvent.changeText(r.getByTestId('users-search'), 'zzz');
    expect(r.getByText(E.no_match)).toBeTruthy();
    fireEvent.changeText(r.getByTestId('users-search'), '  ');
    expect(r.getByTestId('user-row-u1')).toBeTruthy();
    expect(r.getByTestId('user-row-u2')).toBeTruthy();
  });

  it('keeps the search when coming back from a user', async () => {
    const r = await renderPage();
    fireEvent.changeText(r.getByTestId('users-search'), 'noa');
    await openUser(r);
    fireEvent.press(r.getByTestId('back-to-list'));
    expect(r.getByTestId('users-search').props.value).toBe('noa');
    expect(r.queryByTestId('user-row-u2')).toBeNull();
  });

  it('says so when there are no users', async () => {
    mockCallables.adminListUsers.mockResolvedValue({ users: [], truncated: false });
    const r = await renderPage();
    expect(r.getByText(E.no_users)).toBeTruthy();
  });

  it('says so when the list cannot load, and can retry', async () => {
    mockCallables.adminListUsers.mockRejectedValueOnce(new Error('offline'));
    const r = await renderPage();
    expect(r.getByText(E.list_failed)).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByTestId('users-retry')); });
    expect(r.getByText('Noa Levi')).toBeTruthy();
  });
});

describe('opened from another admin screen (?uid=, "Open in Users")', () => {
  it('opens that user straight away, without the list', async () => {
    mockUidParam = 'u1';
    const r = await renderPage();
    expect(getDoc).toHaveBeenCalledWith('users/u1');
    expect(r.getByTestId('user-card')).toBeTruthy();
    expect(within(r.getByTestId('user-card')).getByText('Noa Levi')).toBeTruthy();
    expect(r.queryByTestId('users-list')).toBeNull();
  });

  it('opens it once, and says so when the user is not in the list', async () => {
    mockUidParam = 'does-not-exist';
    const r = await renderPage();
    expect(mockToast).toHaveBeenCalledWith(E.open_failed, 'error');
    expect(r.getByTestId('users-list')).toBeTruthy();
    expect(getDoc).not.toHaveBeenCalledWith('users/does-not-exist');
  });
});

describe('the activity tabs', () => {
  const call = (section: string, cursor?: string) => mockCallables.adminUserActivity.mock.calls
    .filter(([a]) => a.section === section && (cursor === undefined || a.cursor === cursor));

  it('opens on Moderation, titled in both languages, with a count on every tab from ONE summary call', async () => {
    const r = await renderPage();
    await openUser(r);
    expect(call('summary')).toHaveLength(1);
    expect(mockCallables.adminUserActivity).toHaveBeenCalledWith({ uid: 'u1', section: 'summary' });
    const A = en.admin_activity;
    // moderation = 2 actions + 1 report against; projects = 3 + 4; fees = 5 records; disputes = 1 + 2; reviews = 2 + 1; communities = 2
    for (const label of [`${A.tab_moderation} (3)`, `${A.tab_projects} (7)`, `${A.tab_fees} (5)`, `${A.tab_disputes} (3)`, `${A.tab_reviews} (3)`, `${A.tab_communities} (2)`]) {
      expect(r.getByText(label)).toBeTruthy();
    }
    expect(within(r.getByTestId('activity-card-moderation')).getByText(en.admin_activity.tab_moderation)).toBeTruthy();
    expect(he.admin_activity.tab_moderation).toBe('אכיפה');
  });

  it('loads a section only when its tab is opened', async () => {
    const r = await renderPage();
    await openUser(r);
    expect(call('projects')).toHaveLength(0);
    await act(async () => { fireEvent.press(r.getByTestId('activity-tab-projects')); });
    expect(call('projects')).toHaveLength(1);
    expect(r.getByTestId('activity-empty-projects')).toBeTruthy();
  });

  it('a FAILED section shows an error with a retry, never the empty text', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCallables.adminUserActivity.mockImplementation(({ section }: { section: string }) =>
      (section === 'moderation' ? Promise.reject(new Error('permission-denied')) : activityFor({ section })));
    const r = await renderPage();
    await openUser(r);
    expect(r.getByTestId('user-card')).toBeTruthy();
    expect(r.getByTestId('activity-error-moderation')).toBeTruthy();
    expect(within(r.getByTestId('activity-card-moderation')).getByText(en.admin_activity.load_failed)).toBeTruthy();
    expect(r.queryByTestId('activity-empty-moderation')).toBeNull();
    mockCallables.adminUserActivity.mockImplementation(activityFor);
    await act(async () => { fireEvent.press(r.getByTestId('activity-retry-moderation')); });
    expect(r.queryByTestId('activity-error-moderation')).toBeNull();
    expect(r.getByTestId('activity-moderation-a1')).toBeTruthy();
  });

  it('a real empty section still says so', async () => {
    mockCallables.adminUserActivity.mockImplementation(({ section }: { section: string }) =>
      Promise.resolve(section === 'summary' ? { section, summary: SUMMARY } : { section, items: [], nextCursor: null, total: 0, truncated: false }));
    const r = await renderPage();
    await openUser(r);
    expect(r.getByTestId('activity-empty-moderation')).toBeTruthy();
    expect(r.queryByTestId('activity-error-moderation')).toBeNull();
  });

  it('?section= opens that tab first (where the ⋮ "Open full activity" lands)', async () => {
    mockUidParam = 'u1';
    mockSectionParam = 'disputes';
    const r = await renderPage();
    expect(r.getByTestId('activity-card-disputes')).toBeTruthy();
    expect(call('disputes')).toHaveLength(1);
    expect(call('moderation')).toHaveLength(0);
  });

  it('an action from this screen reloads the activity', async () => {
    const r = await renderPage();
    await openUser(r);
    const before = call('moderation').length;
    await act(async () => { fireEvent.press(r.getByTestId('action-clear_warning')); });
    expect(call('moderation').length).toBe(before + 1);
    expect(call('summary').length).toBe(2);
  });
});

describe('a user', () => {
  it('tapping a user opens all their details and history, newest first', async () => {
    const r = await renderPage();
    await openUser(r);
    expect(getDoc).toHaveBeenCalledWith('users/u1');
    expect(r.queryByTestId('users-list')).toBeNull();
    const card = within(r.getByTestId('user-card'));
    expect(card.getByText('Noa Levi')).toBeTruthy();
    expect(card.getByText('noa@example.com')).toBeTruthy();
    expect(card.getByText(E.status_warned)).toBeTruthy();
    expect(card.getByText('Spam in chat')).toBeTruthy();
    const ids = r.UNSAFE_root.findAll((n) => /^activity-moderation-a\d$/.test(n.props.testID ?? '') && n.props.accessible === false).map((n) => n.props.testID);
    expect([...new Set(ids)]).toEqual(['activity-moderation-a1', 'activity-moderation-a2']);
  });

  it('"back to the list" returns to every user', async () => {
    const r = await renderPage();
    await openUser(r);
    fireEvent.press(r.getByTestId('back-to-list'));
    expect(r.queryByTestId('user-card')).toBeNull();
    expect(r.getByTestId('users-list')).toBeTruthy();
  });

  it('a warned user can be cleared, which re-reads the user and reloads their activity', async () => {
    const r = await renderPage();
    await openUser(r);
    getDoc.mockClear();
    await act(async () => {
      fireEvent.press(r.getByTestId('action-clear_warning'));
    });
    expect(mockCallables.moderateUser).toHaveBeenCalledWith({ targetUid: 'u1', action: 'clear_warning', reason: undefined });
    expect(getDoc).toHaveBeenCalledWith('users/u1');
    expect(mockToast).toHaveBeenCalledWith(E.action_applied, 'success');
  });

  it('suspending asks for a reason first, then sends it', async () => {
    const r = await renderPage();
    await openUser(r);
    fireEvent.press(r.getByTestId('action-suspend'));
    expect(r.getByText(E.suspend_user)).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByTestId('reason-submit'));
    });
    expect(mockToast).toHaveBeenCalledWith(E.reason_required, 'error');
    expect(mockCallables.moderateUser).not.toHaveBeenCalled();
    fireEvent.changeText(r.getByTestId('reason-input'), ' Repeated spam ');
    await act(async () => {
      fireEvent.press(r.getByTestId('reason-submit'));
    });
    expect(mockCallables.moderateUser).toHaveBeenCalledWith({ targetUid: 'u1', action: 'suspend', reason: 'Repeated spam' });
  });

  it('a suspended user offers unsuspend instead of warn and suspend', async () => {
    getDoc.mockResolvedValue({ ...USER, moderation: { ...USER.moderation, status: 'suspended' } });
    const r = await renderPage();
    await openUser(r);
    expect(r.queryByTestId('action-warn')).toBeNull();
    expect(r.queryByTestId('action-suspend')).toBeNull();
    expect(r.getByText(E.suspension_reason)).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByTestId('action-unsuspend'));
    });
    expect(mockCallables.moderateUser).toHaveBeenCalledWith({ targetUid: 'u1', action: 'unsuspend', reason: undefined });
  });

  it('sends a BAMA System message', async () => {
    const r = await renderPage();
    await openUser(r);
    fireEvent.press(r.getByTestId('action-message'));
    fireEvent.changeText(r.getByTestId('message-input'), 'Hello there');
    await act(async () => {
      fireEvent.press(r.getByTestId('message-send'));
    });
    expect(mockCallables.sendSystemMessage).toHaveBeenCalledWith({ targetUid: 'u1', text: 'Hello there' });
    expect(mockToast).toHaveBeenCalledWith(E.msg_sent, 'success');
  });
});

describe("the user's phone number", () => {
  const byPath = (contact: unknown) => (path: string) =>
    path.endsWith('/private/contact') ? (contact instanceof Error ? Promise.reject(contact) : Promise.resolve(contact)) : Promise.resolve(USER);

  it('reads it from their private contact doc and shows it the local way; tapping calls', async () => {
    getDoc.mockImplementation(byPath({ phone: '+972541234567' }));
    const open = jest.spyOn(require('react-native').Linking, 'openURL').mockResolvedValue(true);
    const r = await renderPage();
    await openUser(r);
    expect(getDoc).toHaveBeenCalledWith('users/u1/private/contact');
    const row = r.getByTestId('user-phone');
    expect(within(row).getByText('054-123-4567')).toBeTruthy();
    fireEvent.press(row);
    expect(open).toHaveBeenCalledWith('tel:+972541234567');
    open.mockRestore();
  });

  it('says so when they have none, or it cannot be read', async () => {
    for (const contact of [null, {}, new Error('denied')]) {
      getDoc.mockImplementation(byPath(contact));
      const r = await renderPage();
      await openUser(r);
      expect(within(r.getByTestId('user-phone')).getByText(E.no_phone)).toBeTruthy();
      r.unmount();
    }
  });

  it("does not carry one user's number over to the next", async () => {
    getDoc.mockImplementation(byPath({ phone: '+972541234567' }));
    const r = await renderPage();
    await openUser(r);
    expect(r.getByText('054-123-4567')).toBeTruthy();
    fireEvent.press(r.getByTestId('back-to-list'));
    getDoc.mockImplementation(byPath(null));
    await openUser(r, 'u2');
    expect(r.queryByText('054-123-4567')).toBeNull();
    expect(within(r.getByTestId('user-phone')).getByText(E.no_phone)).toBeTruthy();
  });
});
