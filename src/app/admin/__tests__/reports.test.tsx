import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import ReportsAdmin from '../reports';

/**
 * The Reports tab in the admin kit's design: title + subtitle, a pill segment
 * with per-status counts, one card per report. Behaviour is unchanged.
 */

let mockLang = 'en';
const mockToast = jest.fn();
const mockModerate = jest.fn(() => Promise.resolve({ success: true, actionId: 'a1' }));
const mockFlagged = jest.fn((..._a: unknown[]) => Promise.resolve({ rows: [] as unknown[] }));
const mockResolve = jest.fn((..._a: unknown[]) => Promise.resolve({ ok: true, outcome: 'completed', feeDue: 0 }));
const mockPush = jest.fn();
let mockTab: string | undefined;
let mockW = 375;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockW, height: 667, scale: 2, fontScale: 1 }),
}));

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string) => (...a: unknown[]) => (
    name === 'adminListFlaggedProjects' ? mockFlagged(...a)
      : name === 'resolveFeeDispute' ? mockResolve(...a)
        : mockModerate(...(a as []))
  ),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ tab: mockTab }),
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: (sel?: (s: object) => unknown) => { const st = { showToast: mockToast }; return sel ? sel(st) : st; } }));
jest.mock('firebase/firestore', () => ({
  // Refs carry their collection name, so onSnapshot can answer per collection.
  collection: jest.fn((_db, name: string) => name), query: jest.fn((c: string) => c), orderBy: jest.fn(), where: jest.fn(),
  onSnapshot: jest.fn(),
  updateDoc: jest.fn(() => Promise.resolve()), deleteDoc: jest.fn(() => Promise.resolve()),
  doc: jest.fn((_db, col, id) => `${col}/${id}`),
  getDoc: jest.fn(() => Promise.resolve({ data: () => ({ displayName: 'Rita Reporter' }) })),
  Timestamp: class {},
}));

const E = en.admin_reports;
const H = he.admin_reports;

const docs = [
  { id: 'r1', data: { reporterId: 'u1', reportedUserId: 'bad-1', reportedUserName: 'Bad Actor', reason: 'Spam', evidenceURLs: [], status: 'pending', createdAt: null } },
  { id: 'r2', data: { reporterId: 'u2', reportedUserId: 'bad-2', reportedUserName: 'Rude One', reason: 'Rude', evidenceURLs: [], status: 'reviewed', createdAt: null } },
  { id: 'r3', data: { reporterId: 'u3', reportedUserId: 'bad-3', reportedUserName: 'Old Case', reason: 'Old', evidenceURLs: [], status: 'resolved', createdAt: null } },
];

/** What each collection returns: reports, the admin action log, moderated users. */
let mockCollections: Record<string, { id: string; data: Record<string, unknown> }[]> = {};
function serve() {
  (onSnapshot as jest.Mock).mockImplementation((q: string, next: (s: unknown) => void) => {
    next({ docs: (mockCollections[q] ?? []).map((d) => ({ id: d.id, data: () => d.data })) });
    return () => {};
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockTab = undefined;
  mockW = 375;
  mockFlagged.mockImplementation(() => Promise.resolve({ rows: [] }));
  mockCollections = { reports: docs, adminActions: [], users: [] };
  serve();
});

async function renderPage() {
  const r = render(<ReportsAdmin />);
  await act(async () => {});
  return r;
}

it('shows the title, subtitle and greeting header, and is a tab root with no back', async () => {
  const r = await renderPage();
  expect(r.getByText(E.title)).toBeTruthy();
  expect(r.getByText(E.greeting)).toBeTruthy();
  expect(r.getByText(`${en.admin_dashboard.greeting}, Dana`)).toBeTruthy();
  expect(r.queryByTestId('admin-back')).toBeNull();
});

it('filters by status with counts, starting on pending', async () => {
  const r = await renderPage();
  expect(r.getByText(`${E.filter_all} (3)`)).toBeTruthy();
  expect(r.getByText(`${E.filter_pending} (1)`)).toBeTruthy();
  expect(r.getByTestId('filter-pending').props.accessibilityState.selected).toBe(true);
  expect(r.getByText('Bad Actor')).toBeTruthy();
  expect(r.queryByText('Rude One')).toBeNull();

  fireEvent.press(r.getByTestId('filter-all'));
  expect(r.getByText('Rude One')).toBeTruthy();
  expect(r.getByText('Old Case')).toBeTruthy();

  fireEvent.press(r.getByTestId('filter-resolved'));
  expect(r.queryByText('Bad Actor')).toBeNull();
  expect(within(r.getByTestId('report-r3')).getByText(E.status_resolved)).toBeTruthy();
});

it('shows the empty state when there are no reports', async () => {
  mockCollections.reports = [];
  const r = await renderPage();
  expect(r.getByText(E.empty)).toBeTruthy();
});

it('resolves the reporter to a display name', async () => {
  const r = await renderPage();
  expect(within(r.getByTestId('report-r1')).getByText('Rita Reporter · —')).toBeTruthy();
});

it('marks a report reviewed and resolved', async () => {
  const r = await renderPage();
  await act(async () => { fireEvent.press(r.getByTestId('review-r1')); });
  expect(updateDoc).toHaveBeenCalledWith('reports/r1', { status: 'reviewed' });
  expect(mockToast).toHaveBeenCalledWith(E.marked_reviewed, 'success');
  await act(async () => { fireEvent.press(r.getByTestId('resolve-r1')); });
  expect(updateDoc).toHaveBeenCalledWith('reports/r1', { status: 'resolved' });
});

it('suspends the reported user with a reason and resolves the report', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('suspend-r1'));
  expect(r.getByText(`${E.suspend_user} · Bad Actor`)).toBeTruthy();

  // No reason: refused.
  await act(async () => { fireEvent.press(r.getByTestId('mod-submit')); });
  expect(mockToast).toHaveBeenCalledWith(E.reason_required, 'error');
  expect(mockModerate).not.toHaveBeenCalled();

  fireEvent.changeText(r.getByTestId('mod-reason'), '  repeated spam  ');
  await act(async () => { fireEvent.press(r.getByTestId('mod-submit')); });
  expect(mockModerate).toHaveBeenCalledWith({ targetUid: 'bad-1', action: 'suspend', reason: 'repeated spam', reportId: 'r1' });
  expect(updateDoc).toHaveBeenCalledWith('reports/r1', { status: 'resolved' });
  expect(mockToast).toHaveBeenCalledWith(E.suspended_toast, 'success');
  expect(r.queryByTestId('mod-modal')).toBeNull();
});

it('mirrors in Hebrew: title and reason align right, the header runs right to left', async () => {
  mockLang = 'he';
  const r = await renderPage();
  expect(StyleSheet.flatten(r.getByText(H.title).props.style).textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByTestId('dash-header-row').props.style).flexDirection).toBe('row-reverse');
  expect(r.getByText(H.warn)).toBeTruthy();
  const reason = StyleSheet.flatten(r.getByText('Spam').props.style);
  expect(reason.textAlign).toBe('right');
});

describe('a report acted on is Done, and its action is not offered again', () => {
  it('a warning taken from a pending report files it under Done, with the warn button gone', async () => {
    // r1 is still stored as pending (e.g. the resolve write failed back then).
    mockCollections.adminActions = [{ id: 'a1', data: { action: 'warn', reportId: 'r1', targetUserId: 'bad-1' } }];
    const r = await renderPage();
    expect(r.getByText(`${E.filter_pending} (0)`)).toBeTruthy();
    expect(r.getByText(`${E.filter_resolved} (2)`)).toBeTruthy();
    fireEvent.press(r.getByTestId('filter-resolved'));
    const card = within(r.getByTestId('report-r1'));
    expect(card.getByText(E.status_resolved)).toBeTruthy();
    expect(card.getByText(`${E.action_taken}: ${E.taken_warn}`)).toBeTruthy();
    expect(card.queryByTestId('warn-r1')).toBeNull();
    // Suspending is still possible after a warning.
    expect(card.getByTestId('suspend-r1')).toBeTruthy();
    expect(card.queryByTestId('resolve-r1')).toBeNull();
  });

  it('after a suspension neither is offered again', async () => {
    mockCollections.adminActions = [
      { id: 'a1', data: { action: 'warn', reportId: 'r1' } },
      { id: 'a2', data: { action: 'suspend', reportId: 'r1' } },
      { id: 'a3', data: { action: 'unsuspend' } }, // not from a report: ignored
    ];
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-resolved'));
    const card = within(r.getByTestId('report-r1'));
    expect(card.queryByTestId('warn-r1')).toBeNull();
    expect(card.queryByTestId('suspend-r1')).toBeNull();
    expect(card.getByText(`${E.action_taken}: ${E.taken_warn} · ${E.taken_suspend}`)).toBeTruthy();
  });

  it('"Resolved" now reads "Done"', () => {
    expect(E.filter_resolved).toBe('Done');
    expect(E.status_resolved).toBe('Done');
  });
});

describe('the warned & suspended tab', () => {
  const USERS = [
    { id: 'bad-1', data: { displayName: 'Bad Actor', moderation: { status: 'suspended', reason: 'Spam', actorName: 'Dana', actionId: 'x', actorId: 'adm', at: null } } },
    { id: 'bad-2', data: { displayName: 'Rude One', moderation: { status: 'warned', reason: 'Rude', actorName: 'Dana', actionId: 'y', actorId: 'adm', at: null } } },
  ];

  it('lists everyone warned or suspended, with the count on the tab', async () => {
    mockCollections.users = USERS;
    const r = await renderPage();
    expect(r.getByText(`${E.filter_users} (2)`)).toBeTruthy();
    fireEvent.press(r.getByTestId('filter-users'));
    expect(r.queryByTestId('report-r1')).toBeNull();
    const a = within(r.getByTestId('moderated-bad-1'));
    expect(a.getByText('Bad Actor')).toBeTruthy();
    expect(a.getByText(E.status_suspended)).toBeTruthy();
    expect(a.getByText(E.unsuspend)).toBeTruthy();
    const b = within(r.getByTestId('moderated-bad-2'));
    expect(b.getByText(E.status_warned)).toBeTruthy();
    expect(b.getByText(E.clear_warning)).toBeTruthy();
  });

  it('lifts a suspension / a warning after a confirm', async () => {
    mockCollections.users = USERS;
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(
      (...a: unknown[]) => (a[2] as { onPress?: () => void }[])[1].onPress?.(),
    );
    mockModerate.mockResolvedValue({ success: true, actionId: 'z' });
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-users'));
    await act(async () => { fireEvent.press(r.getByTestId('lift-bad-1')); });
    expect(mockModerate).toHaveBeenCalledWith({ targetUid: 'bad-1', action: 'unsuspend', reason: '' });
    expect(mockToast).toHaveBeenCalledWith(E.unsuspend_toast, 'success');
    await act(async () => { fireEvent.press(r.getByTestId('lift-bad-2')); });
    expect(mockModerate).toHaveBeenCalledWith({ targetUid: 'bad-2', action: 'clear_warning', reason: '' });
    alert.mockRestore();
  });

  it('says so when no one is warned or suspended', async () => {
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-users'));
    expect(r.getByText(E.moderated_empty)).toBeTruthy();
  });
});

describe('deleting a report that is no longer relevant (Done tab)', () => {
  const confirm = (yes: boolean) => jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(
    (...a: unknown[]) => (a[2] as { onPress?: () => void }[])[yes ? 1 : 0].onPress?.(),
  );

  it('only Done reports have the bin', async () => {
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-all'));
    expect(r.queryByTestId('delete-report-r1')).toBeNull(); // pending
    expect(r.queryByTestId('delete-report-r2')).toBeNull(); // reviewed
    expect(r.getByTestId('delete-report-r3')).toBeTruthy();  // done
  });

  it('asks first, then deletes it', async () => {
    const alert = confirm(true);
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-resolved'));
    await act(async () => { fireEvent.press(r.getByTestId('delete-report-r3')); });
    expect(alert.mock.calls[0][1]).toBe(E.delete_report_confirm.replace('{{name}}', 'Old Case'));
    expect(deleteDoc).toHaveBeenCalledWith('reports/r3');
    expect(mockToast).toHaveBeenCalledWith(E.report_deleted, 'success');
    alert.mockRestore();
  });

  it('keeps it when the confirm is cancelled, and says so if the delete fails', async () => {
    let alert = confirm(false);
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-resolved'));
    await act(async () => { fireEvent.press(r.getByTestId('delete-report-r3')); });
    expect(deleteDoc).not.toHaveBeenCalled();
    alert.mockRestore();
    alert = confirm(true);
    (deleteDoc as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
    await act(async () => { fireEvent.press(r.getByTestId('delete-report-r3')); });
    expect(mockToast).toHaveBeenCalledWith(E.delete_report_failed, 'error');
    alert.mockRestore();
  });
});


describe('the disputes tab', () => {
  const answer = (yes: boolean) => jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(
    (...a: unknown[]) => (a[2] as { onPress?: () => void }[])[yes ? 1 : 0].onPress?.(),
  );
  afterEach(() => jest.restoreAllMocks());
  const row = {
    projectId: 'p1', title: 'Kitchen shoot', clientName: 'Cleo Client', chatId: 'chat1',
    proId: 'pro1', proName: 'Dana Pro', reason: 'didnt_happen', note: 'The client cancelled on the day',
    flaggedAt: new Date(2026, 10, 18).getTime(),
    disputes: [{ proId: 'pro1', proName: 'Dana Pro', reason: 'didnt_happen', baseAmount: 3000, feeDueIfCompleted: 90 }],
  };
  const unrelated = { ...row, projectId: 'p2', proId: 'pro2', disputes: [], reason: 'completion_unanswered' };

  it('counts open disputes on the tab, ignoring flagged rows that are not disputes', async () => {
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row, unrelated] }));
    const r = await renderPage();
    expect(r.getByText(`${E.filter_disputes} (1)`)).toBeTruthy();
  });

  it('shows — rather than 0 when the disputes could not be loaded, and says so', async () => {
    mockFlagged.mockImplementation(() => Promise.reject(new Error('boom')));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await renderPage();
    expect(r.getByText(`${E.filter_disputes} (—)`)).toBeTruthy();
    fireEvent.press(r.getByTestId('filter-disputes'));
    expect(r.getByTestId('disputes-error')).toBeTruthy();
    expect(r.queryByTestId('disputes-empty')).toBeNull();
  });

  it('a card carries project, professional, client, type, the pro\'s words, date, fee and status', async () => {
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row] }));
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-disputes'));
    const card = within(r.getByTestId('dispute-card-p1:pro1'));
    expect(card.getByText('Kitchen shoot')).toBeTruthy();
    expect(card.getByText(en.admin_fees.pro_label.replace('{{name}}', 'Dana Pro'))).toBeTruthy();
    expect(card.getByText(en.admin_fees.client_label.replace('{{name}}', 'Cleo Client'))).toBeTruthy();
    expect(card.getByText(en.admin_fees.reason_didnt_happen)).toBeTruthy();
    expect(card.getByText('The client cancelled on the day')).toBeTruthy();
    expect(card.getByText(E.dispute_submitted.replace('{{date}}', '18/11/2026'))).toBeTruthy();
    expect(card.getByText(en.admin_fees.dispute_fee_if_completed.replace('{{amount}}', '90'))).toBeTruthy();
    expect(card.getByText(E.dispute_status_open)).toBeTruthy();
  });

  it('shows the held review on the card (stars, text, author) and nothing when none is held', async () => {
    const held = { rating: 1, text: 'Never showed up', authorName: 'Cleo' };
    mockFlagged.mockImplementation(() => Promise.resolve({
      rows: [{ ...row, disputes: [{ ...row.disputes[0], heldReview: held }] }],
    }));
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-disputes'));
    const note = within(r.getByTestId('held-review-p1:pro1'));
    expect(note.getByText(E.held_review_title)).toBeTruthy();
    expect(note.getByTestId('held-review-p1:pro1-stars').props.accessibilityLabel).toBe('1/5');
    expect(note.getAllByTestId('star-filled')).toHaveLength(1);
    expect(note.getAllByTestId('star-empty')).toHaveLength(4);
    expect(note.getByText('Never showed up')).toBeTruthy();
    expect(note.getByText(E.held_review_author.replace('{{name}}', 'Cleo'))).toBeTruthy();

    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row] }));
    const plain = await renderPage();
    fireEvent.press(plain.getByTestId('filter-disputes'));
    expect(plain.queryByTestId('held-review-p1:pro1')).toBeNull();
  });

  it('at 375px the actions stack full-width, the held review and the pro\'s note wrap in full, and nothing is ellipsised', async () => {
    const longNote = 'The professional wrote a long explanation of what happened on the day of the shoot. '.repeat(3).trim();
    const heldText = 'A long review written by the client about how the shoot went, which must never be cut with an ellipsis. '.repeat(2).trim();
    mockFlagged.mockImplementation(() => Promise.resolve({
      rows: [{ ...row, note: longNote, disputes: [{ ...row.disputes[0], heldReview: { rating: 3, text: heldText, authorName: 'Cleo Client' } }] }],
    }));
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-disputes'));
    const card = within(r.getByTestId('dispute-card-p1:pro1'));
    for (const id of ['resolve-completed-p1:pro1', 'resolve-cancelled-p1:pro1', 'open-chat-p1:pro1']) {
      expect(StyleSheet.flatten(r.getByTestId(id).props.style)).toMatchObject({ alignSelf: 'stretch' });
    }
    expect(card.getByText(longNote).props.numberOfLines).toBeUndefined();
    const held = within(r.getByTestId('held-review-p1:pro1'));
    expect(held.getByText(heldText).props.numberOfLines).toBeUndefined();
    expect(held.getByText(heldText).props.selectable).toBe(true);
  });

  it('on a wide window the actions keep their natural width', async () => {
    mockW = 1024;
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row] }));
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-disputes'));
    expect(StyleSheet.flatten(r.getByTestId('resolve-cancelled-p1:pro1').props.style).alignSelf).toBeUndefined();
  });

  it('opens the project chat', async () => {
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row] }));
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-disputes'));
    fireEvent.press(r.getByTestId('open-chat-p1:pro1'));
    expect(mockPush).toHaveBeenCalledWith('/admin/project-chat?chatId=chat1&projectId=p1');
  });

  it('resolves through the existing resolveFeeDispute after a confirm, then reloads the list', async () => {
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row] }));
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-disputes'));
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [] }));
    const alert = answer(true);
    await act(async () => { fireEvent.press(r.getByTestId('resolve-cancelled-p1:pro1')); });
    expect(alert).toHaveBeenCalled();
    expect(mockResolve).toHaveBeenCalledWith({ projectId: 'p1', proId: 'pro1', outcome: 'cancelled' });
    expect(mockToast).toHaveBeenCalledWith(en.admin_fees.resolve_done, 'success');
    expect(r.getByTestId('disputes-empty')).toBeTruthy();
  });

  it('does nothing when the confirm is cancelled', async () => {
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row] }));
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-disputes'));
    answer(false);
    await act(async () => { fireEvent.press(r.getByTestId('resolve-cancelled-p1:pro1')); });
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('opens on the disputes tab from the push (?tab=disputes)', async () => {
    mockTab = 'disputes';
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row] }));
    const r = await renderPage();
    expect(r.getByTestId('filter-disputes').props.accessibilityState.selected).toBe(true);
    expect(r.getByTestId('dispute-card-p1:pro1')).toBeTruthy();
  });

  it('has Hebrew strings for every new key', () => {
    for (const k of Object.keys(en.admin_reports)) expect(H).toHaveProperty(k);
  });
});


describe('people are named, never shown by id, and have a ⋮', () => {
  const row = {
    projectId: 'p1', title: '', clientName: '', clientId: 'client-7', chatId: 'chat1',
    proId: 'pro1', proName: '', reason: 'didnt_happen', note: 'n', flaggedAt: Date.UTC(2026, 10, 18),
    disputes: [{ proId: 'pro1', proName: '', reason: 'didnt_happen', baseAmount: 3000, feeDueIfCompleted: 90 }],
  };

  it('a dispute card names the professional and the client, with a ⋮ each, and never their ids', async () => {
    mockFlagged.mockImplementation(() => Promise.resolve({ rows: [row] }));
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-disputes'));
    const card = within(r.getByTestId('dispute-card-p1:pro1'));
    expect(card.getByText(en.admin_fees.pro_label.replace('{{name}}', en.admin_people.unknown_user))).toBeTruthy();
    expect(card.getByText(en.admin_fees.client_label.replace('{{name}}', en.admin_people.unknown_user))).toBeTruthy();
    expect(card.queryByText(/pro1|client-7/)).toBeNull();
    expect(r.getByTestId('user-more-pro1')).toBeTruthy();
    expect(r.getByTestId('user-more-client-7')).toBeTruthy();
  });

  it('a report card has a ⋮ on the reported user and a "Reported by" line with its own ⋮; a deletion request has no user to show', async () => {
    const r = await renderPage();
    expect(r.getByTestId('report-more-r1')).toBeTruthy();
    expect(within(r.getByTestId('reporter-r1')).getByText(/Rita Reporter/)).toBeTruthy();
    expect(r.getByTestId('user-more-u1')).toBeTruthy(); // the reporter's own ⋮

    mockCollections.reports = [{ id: 'r9', data: { type: 'community_deletion', communityName: 'Gaffers', reporterId: 'u1', reportedUserId: '', reportedUserName: '', reason: 'x', evidenceURLs: [], status: 'pending', createdAt: null } }];
    serve();
    const del = await renderPage();
    expect(del.queryByTestId('report-more-r9')).toBeNull();
  });

  it('the warned & suspended rows have a ⋮, and an unnamed user reads "Unknown user"', async () => {
    mockCollections.users = [{ id: 'u9', data: { displayName: '', moderation: { status: 'warned', reason: 'Spam', actorName: 'Dana', at: null } } }];
    const r = await renderPage();
    fireEvent.press(r.getByTestId('filter-users'));
    const rowEl = within(r.getByTestId('moderated-u9'));
    expect(rowEl.getByText(en.admin_people.unknown_user)).toBeTruthy();
    expect(rowEl.queryByText('u9')).toBeNull();
    expect(r.getByTestId('moderated-more-u9')).toBeTruthy();
  });
});
