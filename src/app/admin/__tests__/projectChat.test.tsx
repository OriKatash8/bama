import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';
import { getDocument, queryDocuments } from '@core/firebase/firestore';
import ProjectChatAdmin from '../project-chat';
import { listenToMessages } from '@features/chat/services/chatService';

/**
 * Admin project chat: the project's group chat, READ-ONLY. Messages with their
 * senders' names, system notes as centred pills, media as labels. There is no
 * input, and nothing is ever written — no read receipt, no unread change.
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
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ chatId: 'chat-1', projectId: 'p1' }) }));
let mockEmit: ((m: unknown[]) => void) | null = null;
const mockUnsub = jest.fn();
jest.mock('@features/chat/services/chatService', () => ({
  listenToMessages: jest.fn((_id: string, cb: (m: unknown[]) => void) => { mockEmit = cb; return mockUnsub; }),
  sendMessage: jest.fn(),
}));
jest.mock('@core/navigation/floatingTabBar', () => ({ useTabBarClearance: () => 80, FLOATING_TAB_BAR_BOTTOM: 24 }));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: mockLang }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { user: { displayName: string } }) => unknown) => s({ user: { displayName: 'Dana Admin' } }),
}));
jest.mock('@core/stores/uiStore', () => ({ useUiStore: () => ({ showToast: mockToast }) }));
jest.mock('firebase/firestore', () => ({ where: jest.fn(() => 'where') }));
jest.mock('@core/firebase/firestore', () => ({ getDocument: jest.fn(), queryDocuments: jest.fn(), updateDocument: jest.fn(), setDocument: jest.fn() }));
jest.mock('@core/firebase/functions', () => ({
  // Resolved at call time: the page builds its callables at import.
  callFunction: (name: string) => (args: unknown) => mockCallables[name](args),
}));

const E = en.admin_projects;
const H = he.admin_projects;
const getDoc = getDocument as jest.Mock;
const { updateDocument, setDocument } = jest.requireMock('@core/firebase/firestore') as Record<string, jest.Mock>;
const { sendMessage } = jest.requireMock('@features/chat/services/chatService') as Record<string, jest.Mock>;

const DOCS: Record<string, unknown> = {
  'projects/p1': { id: 'p1', title: 'Wedding shoot' },
  'chats/chat-1': { id: 'chat-1', type: 'group', members: ['c1', 'pro1'] },
  'users/c1': { id: 'c1', displayName: 'Noa Levi' },
  'users/pro1': { id: 'pro1', displayName: 'Avi Cohen' },
};
const MESSAGES = [
  { id: 'm1', senderId: 'c1', text: 'Hi, when can you start?', timestamp: { seconds: 1_790_000_000 } },
  { id: 'm2', senderId: 'system', system: true, text: '📅 פגישה חדשה: Kickoff', timestamp: { seconds: 1_790_000_100 } },
  { id: 'm3', senderId: 'pro1', text: '', imageURL: 'https://x/a.jpg', timestamp: { seconds: 1_790_000_200 } },
  { id: 'm4', senderId: 'pro1', text: 'Tomorrow', timestamp: { seconds: 1_790_000_300 } },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockLang = 'en';
  mockEmit = null;
  mockRouter.canGoBack.mockReturnValue(true);
  getDoc.mockImplementation(async (path: string) => DOCS[path] ?? null);
});

async function renderPage() {
  const r = render(<ProjectChatAdmin />);
  await act(async () => {});
  await act(async () => { mockEmit?.(MESSAGES); });
  return r;
}

it('shows the project title and says it is read-only', async () => {
  const r = await renderPage();
  expect(r.getByText('Wedding shoot')).toBeTruthy();
  expect(r.getByText(E.chat_read_only)).toBeTruthy();
});

it('listens to the chat and shows each message with its sender', async () => {
  const r = await renderPage();
  expect(listenToMessages).toHaveBeenCalledWith('chat-1', expect.any(Function));
  const m1 = within(r.getByTestId('msg-m1'));
  expect(m1.getByText('Noa Levi')).toBeTruthy();
  expect(m1.getByText('Hi, when can you start?')).toBeTruthy();
  expect(within(r.getByTestId('msg-m4')).getByText('Avi Cohen')).toBeTruthy();
  // One read per sender.
  expect(getDoc.mock.calls.filter(([p]) => p === 'users/pro1')).toHaveLength(1);
});

it('a system note is a centred pill without a sender', async () => {
  const r = await renderPage();
  const pill = r.getByTestId('msg-m2');
  expect(within(pill).getByText('📅 פגישה חדשה: Kickoff')).toBeTruthy();
  expect(within(pill).queryByText('Noa Levi')).toBeNull();
});

it('a photo shows as a label', async () => {
  const r = await renderPage();
  expect(within(r.getByTestId('msg-m3')).getByText(E.chat_photo)).toBeTruthy();
});

it('is read-only: no input, and nothing is ever written', async () => {
  const r = await renderPage();
  expect(r.UNSAFE_queryAllByType(require('react-native').TextInput)).toHaveLength(0);
  expect(updateDocument).not.toHaveBeenCalled();
  expect(setDocument).not.toHaveBeenCalled();
  expect(sendMessage).not.toHaveBeenCalled();
});

it('stops listening when closed', async () => {
  const r = await renderPage();
  r.unmount();
  expect(mockUnsub).toHaveBeenCalled();
});

it('back returns to the projects list', async () => {
  const r = await renderPage();
  mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(r.getByTestId('admin-back'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/admin/projects');
});

it('says so when the chat cannot be read', async () => {
  getDoc.mockImplementation(async (path: string) => {
    if (path === 'chats/chat-1') throw new Error('permission-denied');
    return DOCS[path] ?? null;
  });
  const r = render(<ProjectChatAdmin />);
  await act(async () => {});
  expect(r.getByText(E.chat_failed)).toBeTruthy();
});

it('reads in Hebrew, messages aligned right', async () => {
  mockLang = 'he';
  const r = await renderPage();
  expect(r.getByText(H.chat_read_only)).toBeTruthy();
  expect(StyleSheet.flatten(within(r.getByTestId('msg-m1')).getByText('Hi, when can you start?').props.style).textAlign).toBe('right');
});
