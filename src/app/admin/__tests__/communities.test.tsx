import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { arrayRemove, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { createCommunityChat } from '@features/chat/services/chatService';
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
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: mockToast }) }));
jest.mock('@core/firebase/config', () => ({ db: {} }));
const mockDeleteCommunity = jest.fn((_data: unknown) => Promise.resolve({ ok: true }));
jest.mock('@core/firebase/functions', () => ({
  callFunction: (name: string) => (data: unknown) =>
    name === 'adminDeleteCommunity' ? mockDeleteCommunity(data) : Promise.reject(new Error(`unexpected ${name}`)),
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
  getDoc: jest.fn((path: string) =>
    Promise.resolve({ exists: () => true, data: () => ({ displayName: path === 'users/o1' ? 'Olive Owner' : 'Sam Owner' }) })),
  Timestamp: class {},
}));

const REQUESTS = [
  { id: 'r1', name: 'Gaffers Guild', description: 'Lighting crews', requesterId: 'q1', requesterName: 'Rona', status: 'pending', createdAt: null },
];
const COMMUNITIES = [
  { id: 'c1', name: 'Sound Crew', description: '', ownerId: 'o1', members: ['m1', 'm2'], createdAt: null, status: 'active' },
  { id: 'c2', name: 'Grips Club', description: '', ownerId: 'o2', members: ['m3'], createdAt: null, status: 'suspended' },
];

const snap = onSnapshot as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
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
  expect(val('tile-requests')).toBe('1');
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
  expect(createCommunityChat).toHaveBeenCalledWith('Gaffers Guild', 'Lighting crews', 'q1', undefined, undefined);
  expect(updateDoc).toHaveBeenCalledWith('communityRequests/r1', { status: 'approved' });
  await act(async () => {
    fireEvent.press(r.getByTestId('reject-r1'));
  });
  expect(updateDoc).toHaveBeenCalledWith('communityRequests/r1', { status: 'rejected' });
});

it('suspends / unsuspends, changes the owner and removes a member', async () => {
  const r = await renderPage();
  await act(async () => {
    fireEvent.press(r.getByTestId('suspend-c1'));
  });
  expect(updateDoc).toHaveBeenCalledWith('chats/c1', { status: 'suspended' });
  await act(async () => {
    fireEvent.press(r.getByTestId('suspend-c2'));
  });
  expect(updateDoc).toHaveBeenCalledWith('chats/c2', { status: 'active' });

  fireEvent.changeText(r.getByTestId('owner-input-c1'), ' new-owner ');
  await act(async () => {
    fireEvent.press(r.getByTestId('owner-set-c1'));
  });
  expect(updateDoc).toHaveBeenCalledWith('chats/c1', { ownerId: 'new-owner' });

  expect(r.queryByTestId('members-c1')).toBeNull();
  fireEvent.press(r.getByTestId('members-toggle-c1'));
  expect(r.getByTestId('members-c1')).toBeTruthy();
  await act(async () => {
    fireEvent.press(r.getByTestId('remove-c1-m2'));
  });
  expect(arrayRemove).toHaveBeenCalledWith('m2');
  expect(updateDoc).toHaveBeenCalledWith('chats/c1', { members: { arrayRemove: 'm2' } });
  expect(doc).toHaveBeenCalled();
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
