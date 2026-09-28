import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { onSnapshot, updateDoc } from 'firebase/firestore';
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
  collection: jest.fn(), query: jest.fn(), orderBy: jest.fn(), onSnapshot: jest.fn(),
  updateDoc: jest.fn(() => Promise.resolve()), doc: jest.fn((_db, col, id) => `${col}/${id}`),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  (onSnapshot as jest.Mock).mockImplementation((_q, next: (s: unknown) => void) => {
    next({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
    return () => {};
  });
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
  (onSnapshot as jest.Mock).mockImplementation((_q, next: (s: unknown) => void) => {
    next({ docs: [] });
    return () => {};
  });
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
