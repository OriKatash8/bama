import { renderHook, waitFor } from '@testing-library/react-native';
import { useCommunitySearchIndex } from '../useCommunitySearchIndex';

/**
 * Community search loads the community's messages ONCE, from every channel, and
 * keeps only what can be searched: messages with text. Listing cards and system
 * messages are not something anyone searches for.
 */

type Doc = { id: string; data: Record<string, unknown> };
let mockDocs: Record<string, Doc[]> = {};
let mockFail = false;
const mockReads: string[] = [];

jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  getDocs: async (path: string) => {
    mockReads.push(path);
    if (mockFail) throw new Error('permission-denied');
    return { docs: (mockDocs[path] ?? []).map((d) => ({ id: d.id, data: () => d.data })) };
  },
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));

const ts = (seconds: number) => ({ seconds, nanoseconds: 0 });

beforeEach(() => {
  mockReads.length = 0;
  mockFail = false;
  mockDocs = {
    'chats/c1/channels': [
      { id: 'general', data: { name: 'כללי', kind: 'general' } },
      { id: 'market', data: { name: 'שוק', kind: 'market' } },
    ],
    'chats/c1/channels/general/messages': [
      { id: 'a', data: { senderId: 'u1', text: 'hello camera', timestamp: ts(1) } },
      { id: 'sys', data: { senderId: 'system', text: 'Dana joined', timestamp: ts(2) } },
      { id: 'empty', data: { senderId: 'u1', text: '', imageURL: 'https://x/p.jpg', timestamp: ts(3) } },
    ],
    'chats/c1/channels/market/messages': [
      { id: 'b', data: { senderId: 'u2', text: 'lens for sale', timestamp: ts(4) } },
      { id: 'card', data: { senderId: 'u2', type: 'listing', title: 'Sony', text: 'Sony A7', timestamp: ts(5) } },
      { id: 'cap', data: { senderId: 'u3', text: 'look at this', imageURL: 'https://x/q.jpg', timestamp: ts(6) } },
    ],
  };
});

it('reads every channel once and keeps the searchable messages, with their channel', async () => {
  const { result } = renderHook(() => useCommunitySearchIndex('c1'));
  await waitFor(() => expect(result.current.status).toBe('ready'));

  expect(result.current.messages.map((m) => [m.id, m.channelId, m.channelName])).toEqual([
    ['a', 'general', 'כללי'],
    ['b', 'market', 'שוק'],
    ['cap', 'market', 'שוק'], // a photo's caption is searchable
  ]);
  expect(mockReads.sort()).toEqual([
    'chats/c1/channels', 'chats/c1/channels/general/messages', 'chats/c1/channels/market/messages',
  ]);
});

it('says so when the messages cannot be read', async () => {
  mockFail = true;
  const { result } = renderHook(() => useCommunitySearchIndex('c1'));
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.messages).toEqual([]);
});

it('starts loading, and reads nothing without a chat id', async () => {
  const { result } = renderHook(() => useCommunitySearchIndex(undefined));
  expect(result.current.status).toBe('loading');
  await Promise.resolve();
  expect(mockReads).toEqual([]);
});
