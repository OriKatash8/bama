import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ChatSearchSheet } from '../ChatSearchSheet';
import { useCommunitySearchIndex } from '../../hooks/useCommunitySearchIndex';
import en from '@core/i18n/translations/en.json';

/**
 * Search inside the chat, as a sheet over the room — not a page of its own.
 * Type, tap a result: the sheet hands the message to the room, which closes it
 * and jumps there.
 */

jest.mock('../../hooks/useCommunitySearchIndex', () => ({ useCommunitySearchIndex: jest.fn() }));
jest.mock('@core/firebase/firestore', () => ({
  getDocument: jest.fn(async (path: string) => ({ displayName: `Name ${path.split('/')[1]}` })),
}));
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

const mockIndex = useCommunitySearchIndex as jest.MockedFunction<typeof useCommunitySearchIndex>;
const ts = (seconds: number) => ({ seconds, nanoseconds: 0 });

beforeEach(() => {
  jest.clearAllMocks();
  mockIndex.mockReturnValue({
    status: 'ready',
    messages: [
      { id: 'd1', channelId: '', channelName: '', senderId: 'u1', text: 'bring the camera', timestamp: ts(1) },
      { id: 'd2', channelId: '', channelName: '', senderId: 'u2', text: 'nothing here', timestamp: ts(2) },
    ],
  });
});

async function renderSheet(onPick = jest.fn(), onClose = jest.fn()) {
  const r = render(<ChatSearchSheet visible chatId="d" kind="chat" onPick={onPick} onClose={onClose} />);
  await act(async () => { await Promise.resolve(); });
  return { r, onPick, onClose };
}

it('searches this chat, of the kind it was opened from', async () => {
  const { r } = await renderSheet();
  expect(mockIndex).toHaveBeenLastCalledWith('d', 'chat');

  fireEvent.changeText(r.getByPlaceholderText(en.community_search.placeholder), 'camera');
  await act(async () => { await Promise.resolve(); });
  expect(r.getByTestId('search-result-d1')).toBeTruthy();
  expect(r.queryByTestId('search-result-d2')).toBeNull();
});

it('a tapped result goes to the room', async () => {
  const { r, onPick } = await renderSheet();
  fireEvent.changeText(r.getByPlaceholderText(en.community_search.placeholder), 'camera');
  await act(async () => { await Promise.resolve(); });

  fireEvent.press(r.getByTestId('search-result-d1'));
  expect(onPick).toHaveBeenCalledWith({ chatId: 'd', channelId: '', messageId: 'd1' });
});

it('loads nothing while closed', () => {
  render(<ChatSearchSheet visible={false} chatId="d" kind="chat" onPick={jest.fn()} onClose={jest.fn()} />);
  expect(mockIndex).not.toHaveBeenCalled();
});
