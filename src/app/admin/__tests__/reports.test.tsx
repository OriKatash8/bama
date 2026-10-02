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
jest.mock('@core/firebase/functions', () => ({ callFunction: () => (...a: unknown[]) => mockModerate(...(a as [])) }));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: mockToast }) }));
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
