import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import ProjectsAdmin from '../projects';

/**
 * Admin Projects: every project — title, client, status, date — with a search
 * by title or client name, reached from the dashboard's "total projects" tile.
 * Tapping one opens its chat, read-only (admin/project-chat).
 */

let mockLang = 'en';
const mockToast = jest.fn();
const mockCallables: Record<string, jest.Mock> = {
  adminListUsers: jest.fn(),
  moderateUser: jest.fn(),
  sendSystemMessage: jest.fn(),
};

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0 }) }));
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
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

const E = en.admin_projects;
const H = he.admin_projects;
const getDoc = getDocument as jest.Mock;
const queryDocs = queryDocuments as jest.Mock;

const PROJECTS = [
  { id: 'p1', title: 'Wedding shoot', clientId: 'c-noa', status: 'open', chatId: 'chat-1', createdAt: { seconds: 1_790_000_000 } },
  { id: 'p2', title: 'Promo video', clientId: 'c-avi', status: 'completed', chatId: 'chat-2', createdAt: { seconds: 1_780_000_000 } },
  { id: 'p3', title: 'Not hired yet', clientId: 'c-noa', status: 'open', createdAt: { seconds: 1_770_000_000 } },
];
const NAMES: Record<string, string> = { 'c-noa': 'Noa Levi', 'c-avi': 'Avi Cohen' };

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockRouter.canGoBack.mockReturnValue(true);
  queryDocs.mockResolvedValue(PROJECTS);
  getDoc.mockImplementation(async (path: string) => ({ id: path.split('/')[1], displayName: NAMES[path.split('/')[1]] }));
});

async function renderPage() {
  const r = render(<ProjectsAdmin />);
  await act(async () => {});
  return r;
}

it('lists every project, newest first, with its client, status and date', async () => {
  const r = await renderPage();
  expect(queryDocs).toHaveBeenCalledWith('projects');
  const row = within(r.getByTestId('project-row-p1'));
  expect(row.getByText('Wedding shoot')).toBeTruthy();
  expect(row.getByText(E.status_open)).toBeTruthy();
  expect(row.getByText(new RegExp('Noa Levi'))).toBeTruthy();
  expect(within(r.getByTestId('project-row-p2')).getByText(E.status_completed)).toBeTruthy();
  const order = r.UNSAFE_root.findAll((n) => /^project-row-p\d$/.test(n.props.testID ?? '') && typeof n.type === 'string').map((n) => n.props.testID);
  expect([...new Set(order)]).toEqual(['project-row-p1', 'project-row-p2', 'project-row-p3']);
  // Client names are read once per client, not once per project.
  expect(getDoc.mock.calls.filter(([p]) => p === 'users/c-noa')).toHaveLength(1);
});

it('searches by title or client name as you type', async () => {
  const r = await renderPage();
  fireEvent.changeText(r.getByTestId('projects-search'), 'promo');
  expect(r.queryByTestId('project-row-p1')).toBeNull();
  expect(r.getByTestId('project-row-p2')).toBeTruthy();
  fireEvent.changeText(r.getByTestId('projects-search'), 'noa');
  expect(r.getByTestId('project-row-p1')).toBeTruthy();
  expect(r.getByTestId('project-row-p3')).toBeTruthy();
  expect(r.queryByTestId('project-row-p2')).toBeNull();
  fireEvent.changeText(r.getByTestId('projects-search'), 'zzz');
  expect(r.getByText(E.no_match)).toBeTruthy();
});

it('tapping a project opens its chat, read-only', async () => {
  const r = await renderPage();
  fireEvent.press(r.getByTestId('project-row-p1'));
  expect(mockRouter.push).toHaveBeenCalledWith('/admin/project-chat?chatId=chat-1&projectId=p1');
});

it('a project with no chat yet says so and does not open', async () => {
  const r = await renderPage();
  expect(within(r.getByTestId('project-row-p3')).getByText(E.no_chat)).toBeTruthy();
  fireEvent.press(r.getByTestId('project-row-p3'));
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('has a back button to the dashboard', async () => {
  const r = await renderPage();
  mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/admin');
});

it('says so when the projects cannot load, and can retry', async () => {
  queryDocs.mockRejectedValueOnce(new Error('offline'));
  const r = await renderPage();
  expect(r.getByText(E.list_failed)).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByTestId('projects-retry')); });
  expect(r.getByTestId('project-row-p1')).toBeTruthy();
});

it('reads in Hebrew', async () => {
  mockLang = 'he';
  const r = await renderPage();
  expect(StyleSheet.flatten(r.getByText(H.title).props.style).textAlign).toBe('right');
  expect(StyleSheet.flatten(r.getByTestId('project-row-p1').props.style).flexDirection).toBe('row-reverse');
  expect(within(r.getByTestId('project-row-p1')).getByText(H.status_open)).toBeTruthy();
});
