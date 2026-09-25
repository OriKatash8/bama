import { renderHook, act } from '@testing-library/react-native';
import { useCommunityMedia } from '../useCommunityMedia';

/**
 * A COMMUNITY'S MEDIA LIVES IN ITS CHANNELS.
 *
 * Community messages are written to chats/{id}/channels/{cid}/messages, never to
 * chats/{id}/messages, so useChatMedia — which reads only the latter — would show
 * a community as having no media at all. This listens to every channel's photos
 * and videos and merges them, newest first.
 */

type Listener = (snap: unknown) => void;
const mockListeners = new Map<string, Listener>();
const mockUnsubs: string[] = [];

jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  query: (path: string, ...cs: string[]) => [path, ...cs].join('|'),
  where: (field: string) => field,
  onSnapshot: (key: string, cb: Listener) => {
    mockListeners.set(key, cb);
    return () => { mockUnsubs.push(key); };
  },
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));


const ts = (seconds: number) => ({ seconds, nanoseconds: 0 });
const snap = (docs: { id: string; data: Record<string, unknown> }[]) =>
  ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
const fire = (key: string, docs: { id: string; data: Record<string, unknown> }[]) =>
  act(() => { mockListeners.get(key)!(snap(docs)); });

beforeEach(() => { mockListeners.clear(); mockUnsubs.length = 0; });

it('merges photos and videos from every channel, newest first', () => {
  const { result } = renderHook(() => useCommunityMedia('c1'));
  fire('chats/c1/channels', [{ id: 'general', data: {} }, { id: 'market', data: {} }]);

  fire('chats/c1/channels/general/messages|imageURL', [{ id: 'a', data: { imageURL: 'https://x/a.jpg', timestamp: ts(10) } }]);
  fire('chats/c1/channels/general/messages|videoUrl', []);
  fire('chats/c1/channels/market/messages|imageURL', [{ id: 'b', data: { imageURL: 'https://x/b.jpg', timestamp: ts(30) } }]);
  fire('chats/c1/channels/market/messages|videoUrl', [{ id: 'v', data: { videoUrl: 'https://x/v.mp4', timestamp: ts(20) } }]);

  expect(result.current.map((m) => m.url)).toEqual(['https://x/b.jpg', 'https://x/v.mp4', 'https://x/a.jpg']);
});

it('keeps two channels\' messages apart even when their ids collide', () => {
  const { result } = renderHook(() => useCommunityMedia('c1'));
  fire('chats/c1/channels', [{ id: 'one', data: {} }, { id: 'two', data: {} }]);
  fire('chats/c1/channels/one/messages|imageURL', [{ id: 'same', data: { imageURL: 'https://x/1.jpg', timestamp: ts(1) } }]);
  fire('chats/c1/channels/two/messages|imageURL', [{ id: 'same', data: { imageURL: 'https://x/2.jpg', timestamp: ts(2) } }]);

  expect(result.current).toHaveLength(2);
  expect(new Set(result.current.map((m) => m.id)).size).toBe(2);
});

it('drops a deleted channel\'s media and stops listening to it', () => {
  const { result } = renderHook(() => useCommunityMedia('c1'));
  fire('chats/c1/channels', [{ id: 'gone', data: {} }]);
  fire('chats/c1/channels/gone/messages|imageURL', [{ id: 'a', data: { imageURL: 'https://x/a.jpg', timestamp: ts(1) } }]);
  expect(result.current).toHaveLength(1);

  fire('chats/c1/channels', []);

  expect(result.current).toHaveLength(0);
  expect(mockUnsubs).toEqual(expect.arrayContaining([
    'chats/c1/channels/gone/messages|imageURL', 'chats/c1/channels/gone/messages|videoUrl',
  ]));
});

it('listens to nothing without a chat id', () => {
  const { result } = renderHook(() => useCommunityMedia(undefined));
  expect(mockListeners.size).toBe(0);
  expect(result.current).toEqual([]);
});

it('stops every listener on unmount', () => {
  const { unmount } = renderHook(() => useCommunityMedia('c1'));
  fire('chats/c1/channels', [{ id: 'general', data: {} }]);
  unmount();
  expect(mockUnsubs).toEqual(expect.arrayContaining([
    'chats/c1/channels', 'chats/c1/channels/general/messages|imageURL', 'chats/c1/channels/general/messages|videoUrl',
  ]));
});
