import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { CommunitySearchScreen } from '../CommunitySearchScreen';
import { useCommunitySearchIndex, type SearchIndex } from '../../hooks/useCommunitySearchIndex';
import { useChatJumpStore } from '@core/stores/chatJumpStore';
import en from '@core/i18n/translations/en.json';

/**
 * Search inside a community, from its details page. Type at least two
 * characters; every message containing them, from every channel, newest first,
 * with its channel, sender and the match in bold. Tapping one goes back to the
 * chat room and asks it to open that channel at that message.
 */

const mockDismissTo = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ dismissTo: mockDismissTo, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
}));
jest.mock('../../hooks/useCommunitySearchIndex', () => ({ useCommunitySearchIndex: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({
  getDocument: jest.fn(async (path: string) => ({ id: path.split('/')[1], displayName: `Name ${path.split('/')[1]}` })),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));
jest.mock('@core/stores/authStore', () => ({
  useAuthStore: (s: (x: { activeMode: string }) => unknown) => s({ activeMode: 'professional' }),
}));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

const mockIndex = useCommunitySearchIndex as jest.MockedFunction<typeof useCommunitySearchIndex>;
const s = en.community_search;
const ts = (seconds: number) => ({ seconds, nanoseconds: 0 });
const ready = (messages: SearchIndex['messages']): SearchIndex => ({ status: 'ready', messages });
const MESSAGES: SearchIndex['messages'] = [
  { id: 'a', channelId: 'general', channelName: 'General', senderId: 'u1', text: 'Looking for a camera', timestamp: ts(10) },
  { id: 'b', channelId: 'market', channelName: 'Market', senderId: 'u2', text: 'Selling my old camera', timestamp: ts(20) },
  { id: 'c', channelId: 'general', channelName: 'General', senderId: 'u1', text: 'Nothing to see', timestamp: ts(30) },
];

async function renderScreen() {
  const r = render(<CommunitySearchScreen chatId="c1" />);
  await act(async () => { await Promise.resolve(); });
  return r;
}
async function type(r: ReturnType<typeof render>, text: string) {
  fireEvent.changeText(r.getByPlaceholderText(s.placeholder), text);
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  useChatJumpStore.setState({ pending: null });
  mockIndex.mockReturnValue(ready(MESSAGES));
});

it('says it is loading while the messages load', async () => {
  mockIndex.mockReturnValue({ status: 'loading', messages: [] });
  const r = await renderScreen();
  expect(r.getByText(s.loading)).toBeTruthy();
});

it('says so when the messages cannot be read', async () => {
  mockIndex.mockReturnValue({ status: 'error', messages: [] });
  const r = await renderScreen();
  expect(r.getByText(s.error)).toBeTruthy();
});

it('asks for two characters before searching', async () => {
  const r = await renderScreen();
  expect(r.getByText(s.min_chars)).toBeTruthy();
  await type(r, 'c');
  expect(r.getByText(s.min_chars)).toBeTruthy();
  expect(r.queryByTestId('search-result-a')).toBeNull();
});

it('lists every match, newest first, with channel, sender, and the match in bold', async () => {
  const r = await renderScreen();
  await type(r, 'camera');

  expect(r.getByText('2 results')).toBeTruthy();
  const rows = r.getAllByTestId(/^search-result-/).map((n) => n.props.testID);
  expect(rows).toEqual(['search-result-b', 'search-result-a']);
  expect(r.getByText('Market')).toBeTruthy();
  expect(r.getByText('Name u2')).toBeTruthy();

  const bold = r.getAllByTestId('search-match');
  expect(bold[0].props.children).toBe('camera');
  expect(StyleSheet.flatten(bold[0].props.style).fontWeight).toBe('700');
});

it('says when nothing matches', async () => {
  const r = await renderScreen();
  await type(r, 'drone');
  expect(r.getByText(s.no_results)).toBeTruthy();
});

it('tapping a result asks the room for that message and pops back to it, in the viewer\'s stack', async () => {
  const r = await renderScreen();
  await type(r, 'camera');

  fireEvent.press(r.getByTestId('search-result-b'));

  expect(useChatJumpStore.getState().pending).toEqual({ chatId: 'c1', channelId: 'market', messageId: 'b' });
  expect(mockDismissTo).toHaveBeenCalledWith('/(professional)/chat/c1');
});

it('back goes back', async () => {
  const r = await renderScreen();
  fireEvent.press(r.getByTestId('search-back'));
  expect(mockBack).toHaveBeenCalled();
});
