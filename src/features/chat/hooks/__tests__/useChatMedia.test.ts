jest.mock('firebase/firestore', () => ({ collection: jest.fn(), onSnapshot: jest.fn(), query: jest.fn(), where: jest.fn() }));
jest.mock('@core/firebase/config', () => ({ db: {} }));

import { mergeChatMedia } from '../useChatMedia';

/**
 * A chat's media = every message carrying a photo (imageURL) or a video (videoUrl),
 * newest first, as one list the project-details media section and its viewer share.
 */

const ts = (seconds: number) => ({ seconds, nanoseconds: 0 });

it('merges photos and videos, newest first', () => {
  const media = mergeChatMedia(
    [{ id: 'p1', data: { imageURL: 'https://x/p1.jpg', timestamp: ts(10) } },
     { id: 'p2', data: { imageURL: 'https://x/p2.jpg', timestamp: ts(30) } }],
    [{ id: 'v1', data: { videoUrl: 'https://x/v1.mp4', timestamp: ts(20) } }],
  );
  expect(media.map((m) => [m.id, m.type, m.url])).toEqual([
    ['p2', 'image', 'https://x/p2.jpg'],
    ['v1', 'video', 'https://x/v1.mp4'],
    ['p1', 'image', 'https://x/p1.jpg'],
  ]);
});

it('a message still being written (no server timestamp yet) sorts as newest', () => {
  const media = mergeChatMedia(
    [{ id: 'old', data: { imageURL: 'https://x/o.jpg', timestamp: ts(5) } },
     { id: 'pending', data: { imageURL: 'https://x/n.jpg', timestamp: null } }],
    [],
  );
  expect(media[0].id).toBe('pending');
});

it('ignores empty or non-string urls, and never lists one message twice', () => {
  const media = mergeChatMedia(
    [{ id: 'a', data: { imageURL: '', timestamp: ts(1) } },
     { id: 'b', data: { imageURL: 42, timestamp: ts(2) } },
     { id: 'both', data: { imageURL: 'https://x/b.jpg', videoUrl: 'https://x/b.mp4', timestamp: ts(3) } }],
    [{ id: 'both', data: { imageURL: 'https://x/b.jpg', videoUrl: 'https://x/b.mp4', timestamp: ts(3) } }],
  );
  expect(media.map((m) => m.id)).toEqual(['both']);
  expect(media[0].type).toBe('video');
});

it('shapes items for the full-screen viewer', () => {
  const [item] = mergeChatMedia([{ id: 'p', data: { imageURL: 'https://x/p.jpg', timestamp: ts(7) } }], []);
  expect(item).toEqual({ id: 'p', url: 'https://x/p.jpg', type: 'image', thumbnailUrl: null, uploadedAt: ts(7) });
});
