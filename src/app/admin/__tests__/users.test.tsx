import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import UsersAdmin from '../users';

/**
 * The users page in the admin dashboard's design. The Firestore helpers and the
 * callables are faked at the module boundary; the search, moderation and
 * message flows must still call them exactly as before.
 */

let mockLang = 'en';
const mockToast = jest.fn();
const mockCallables: Record<string, jest.Mock> = {
  adminFindUser: jest.fn(),
  moderateUser: jest.fn(),
  sendSystemMessage: jest.fn(),
};

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }) }));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: mockToast }) }));
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

const USER = {
  id: 'u1',
  displayName: 'Noa Levi',
  createdAt: { seconds: 1_700_000_000 },
  moderation: { status: 'warned', reason: 'Spam in chat', actorName: 'Dana Admin', at: { seconds: 1_700_100_000 } },
};
const HISTORY = [
  { id: 'a1', action: 'warn', reason: 'Spam in chat', actorName: 'Dana Admin', createdAt: { seconds: 1_700_100_000 } },
  { id: 'a2', action: 'suspend', reason: 'Older', actorName: 'Eli Admin', createdAt: { seconds: 1_600_000_000 } },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockCallables.adminFindUser.mockResolvedValue({ uid: 'u1', email: 'noa@example.com', disabled: false });
  mockCallables.moderateUser.mockResolvedValue({ success: true, actionId: 'x' });
  mockCallables.sendSystemMessage.mockResolvedValue({ chatId: 'c' });
  getDoc.mockResolvedValue(USER);
  queryDocs.mockResolvedValue([...HISTORY]);
});

async function searchFor(r: ReturnType<typeof render>, term = 'noa@example.com') {
  fireEvent.changeText(r.getByTestId('user-search'), term);
  await act(async () => {
    fireEvent.press(r.getByTestId('user-search-go'));
  });
}

it('shows the title and subtitle in English, aligned left', () => {
  const r = render(<UsersAdmin />);
  expect(r.getByText(E.title)).toBeTruthy();
  expect(r.getByText(E.greeting)).toBeTruthy();
  expect(StyleSheet.flatten(r.getByText(E.title).props.style).textAlign).toBe('left');
  // A tab root: no back button.
  expect(r.queryByTestId('admin-back')).toBeNull();
});

it('mirrors in Hebrew: title aligns right, rows run right to left', async () => {
  mockLang = 'he';
  const r = render(<UsersAdmin />);
  expect(StyleSheet.flatten(r.getByText(H.title).props.style).textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByTestId('dash-header-row').props.style).flexDirection).toBe('row-reverse');
  await searchFor(r);
  expect(StyleSheet.flatten(r.getByTestId('history-a1').props.style).flexDirection).toBe('row-reverse');
  expect(within(r.getByTestId('user-card')).getByText(H.status_warned)).toBeTruthy();
});

it('searches by the typed term and shows the user with their history, newest first', async () => {
  const r = render(<UsersAdmin />);
  await searchFor(r, '  noa@example.com ');
  expect(mockCallables.adminFindUser).toHaveBeenCalledWith({ term: 'noa@example.com' });
  expect(getDoc).toHaveBeenCalledWith('users/u1');
  expect(queryDocs).toHaveBeenCalledWith('adminActions', 'where');
  const card = within(r.getByTestId('user-card'));
  expect(card.getByText('Noa Levi')).toBeTruthy();
  expect(card.getByText('noa@example.com')).toBeTruthy();
  expect(card.getByText(E.status_warned)).toBeTruthy();
  expect(card.getByText('Spam in chat')).toBeTruthy();
  const ids = r.UNSAFE_root.findAll((n) => /^history-a\d$/.test(n.props.testID ?? '') && n.props.accessible === false).map((n) => n.props.testID);
  expect([...new Set(ids)]).toEqual(['history-a1', 'history-a2']);
});

it('an empty term does not search', async () => {
  const r = render(<UsersAdmin />);
  await searchFor(r, '   ');
  expect(mockCallables.adminFindUser).not.toHaveBeenCalled();
});

it('says so when no user matches', async () => {
  mockCallables.adminFindUser.mockRejectedValue({ code: 'functions/not-found' });
  const r = render(<UsersAdmin />);
  await searchFor(r);
  expect(r.getByText(E.not_found)).toBeTruthy();
  expect(r.queryByTestId('user-card')).toBeNull();
});

it('a warned user can be cleared, which re-reads the user and their history', async () => {
  const r = render(<UsersAdmin />);
  await searchFor(r);
  getDoc.mockClear();
  await act(async () => {
    fireEvent.press(r.getByTestId('action-clear_warning'));
  });
  expect(mockCallables.moderateUser).toHaveBeenCalledWith({ targetUid: 'u1', action: 'clear_warning', reason: undefined });
  expect(getDoc).toHaveBeenCalledWith('users/u1');
  expect(mockToast).toHaveBeenCalledWith(E.action_applied, 'success');
});

it('suspending asks for a reason first, then sends it', async () => {
  const r = render(<UsersAdmin />);
  await searchFor(r);
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
  const r = render(<UsersAdmin />);
  await searchFor(r);
  expect(r.queryByTestId('action-warn')).toBeNull();
  expect(r.queryByTestId('action-suspend')).toBeNull();
  expect(r.getByText(E.suspension_reason)).toBeTruthy();
  await act(async () => {
    fireEvent.press(r.getByTestId('action-unsuspend'));
  });
  expect(mockCallables.moderateUser).toHaveBeenCalledWith({ targetUid: 'u1', action: 'unsuspend', reason: undefined });
});

it('sends a BAMA System message', async () => {
  const r = render(<UsersAdmin />);
  await searchFor(r);
  fireEvent.press(r.getByTestId('action-message'));
  fireEvent.changeText(r.getByTestId('message-input'), 'Hello there');
  await act(async () => {
    fireEvent.press(r.getByTestId('message-send'));
  });
  expect(mockCallables.sendSystemMessage).toHaveBeenCalledWith({ targetUid: 'u1', text: 'Hello there' });
  expect(mockToast).toHaveBeenCalledWith(E.msg_sent, 'success');
});
