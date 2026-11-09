import { renderHook, act } from '@testing-library/react-native';

const mockUploadVideo = jest.fn();
const mockVideoCancel = jest.fn();
let mockOutcome: string | null = null;
let mockVideoStage = 'idle';
jest.mock('@core/hooks/useVideoUpload', () => ({
  useVideoUpload: () => ({
    stage: mockVideoStage, progress: 0.4, cancel: mockVideoCancel,
    uploadVideo: (...a: unknown[]) => mockUploadVideo(...a), getOutcome: () => mockOutcome,
  }),
}));
const mockUploadFile = jest.fn();
jest.mock('@core/firebase/storage', () => ({ uploadFile: (...a: unknown[]) => mockUploadFile(...a) }));
jest.mock('@core/media/prepareImageForUpload', () => ({
  prepareImageForUpload: async () => 'file:///p.jpg', CHAT_IMAGE: { maxSide: 2048, quality: 0.8 },
}));
const mockAddDoc = jest.fn(async (..._a: unknown[]) => ({}));
jest.mock('firebase/firestore', () => ({
  addDoc: (...a: unknown[]) => mockAddDoc(...a),
  collection: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  serverTimestamp: () => 'TS',
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));
const mockSendMessage = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('../../services/chatService', () => ({ sendMessage: (...a: unknown[]) => mockSendMessage(...a) }));
const mockToast = jest.fn();
jest.mock('@core/stores/uiStore', () => ({
  useUiStore: (sel: (s: { showToast: typeof mockToast }) => unknown) => sel({ showToast: mockToast }),
}));

import { useChatMediaSend, pendingHasLanded } from '../useChatMediaSend';

const t = (k: string) => k;
const VIDEO = { uri: 'file:///v.mov', type: 'video' } as never;
const PHOTO = { uri: 'file:///i.heic', type: 'image' } as never;
const base = { chatId: 'c1', chatType: 'dm' as string | null, activeChannelId: '', currentUserId: 'u1', t };

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  jest.clearAllMocks();
  mockOutcome = null;
  mockVideoStage = 'idle';
  (global as { fetch: unknown }).fetch = jest.fn(async () => ({ blob: async () => ({}) }));
});

it('video: shows a pending item, then writes the message once with the final url', async () => {
  let resolve!: (v: string) => void;
  mockUploadVideo.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
  const { result } = renderHook(() => useChatMediaSend(base));
  act(() => result.current.start(VIDEO, 'video', 'hi'));
  expect(result.current.pending?.type).toBe('video');
  expect(result.current.inFlight).toBe(true);
  expect(mockUploadVideo).toHaveBeenCalledWith('chat-videos', 'u1', VIDEO, { maxSize: 1280, bitrate: 2_000_000 });
  expect(mockSendMessage).not.toHaveBeenCalled();

  await act(async () => { resolve('https://v/final.mp4'); });
  await flush();
  expect(mockSendMessage).toHaveBeenCalledTimes(1);
  expect(mockSendMessage).toHaveBeenCalledWith('c1', 'u1', 'hi', { videoUrl: 'https://v/final.mp4' });
  expect(result.current.pending).toBeNull();
});

it('image: prepares, uploads to chat-images and writes imageURL', async () => {
  mockUploadFile.mockResolvedValue('https://i/final.jpg');
  const { result } = renderHook(() => useChatMediaSend(base));
  await act(async () => { result.current.start(PHOTO, 'image', ''); });
  await flush();
  expect(mockUploadFile.mock.calls[0][0]).toMatch(/^chat-images\/c1\/\d+\.jpg$/);
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('file:///p.jpg');
  expect(mockSendMessage).toHaveBeenCalledWith('c1', 'u1', '', { imageURL: 'https://i/final.jpg' });
});

it('a community send goes to the channel it was sent from, even if the user switches', async () => {
  let resolve!: (v: string) => void;
  mockUploadVideo.mockReturnValue(new Promise<string>((r) => { resolve = r; }));
  const { result, rerender } = renderHook((p: typeof base) => useChatMediaSend(p), {
    initialProps: { ...base, chatType: 'community', activeChannelId: 'general' },
  });
  act(() => result.current.start(VIDEO, 'video', ''));
  rerender({ ...base, chatType: 'community', activeChannelId: 'other' });
  expect(result.current.pending?.channelId).toBe('general');
  await act(async () => { resolve('https://v/x.mp4'); });
  await flush();
  expect((mockAddDoc.mock.calls[0] as unknown[])[0]).toEqual({ path: 'chats/c1/channels/general/messages' });
});

it('cancel stops the upload, clears the item and writes nothing', async () => {
  let resolve!: (v: string | null) => void;
  mockUploadVideo.mockReturnValue(new Promise<string | null>((r) => { resolve = r; }));
  const { result } = renderHook(() => useChatMediaSend(base));
  act(() => result.current.start(VIDEO, 'video', ''));
  act(() => result.current.cancel());
  expect(mockVideoCancel).toHaveBeenCalled();
  expect(result.current.pending).toBeNull();
  expect(result.current.inFlight).toBe(false);
  mockOutcome = 'cancelled';
  await act(async () => { resolve(null); });
  await flush();
  expect(mockSendMessage).not.toHaveBeenCalled();
  expect(result.current.pending).toBeNull();
});

it('failure keeps the item as failed; retry runs it again and sends', async () => {
  mockUploadVideo.mockResolvedValueOnce(null).mockResolvedValueOnce('https://v/ok.mp4');
  mockOutcome = 'failed';
  const { result } = renderHook(() => useChatMediaSend(base));
  await act(async () => { result.current.start(VIDEO, 'video', 'cap'); });
  await flush();
  expect(result.current.pending?.failed).toBe(true);
  expect(result.current.inFlight).toBe(false); // nothing sending: leaving needs no dialog
  expect(mockSendMessage).not.toHaveBeenCalled();

  mockOutcome = 'ok';
  await act(async () => { result.current.retry(); });
  await flush();
  expect(mockSendMessage).toHaveBeenCalledWith('c1', 'u1', 'cap', { videoUrl: 'https://v/ok.mp4' });
  expect(result.current.pending).toBeNull();
});

it('a second pick while one is sending gets a toast and is refused; idle and failed are fine', async () => {
  mockUploadVideo.mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useChatMediaSend(base));
  expect(result.current.canStartNew()).toBe(true);
  act(() => result.current.start(VIDEO, 'video', ''));
  expect(result.current.canStartNew()).toBe(false);
  expect(mockToast).toHaveBeenCalledWith('chats.media_send_in_progress', 'info');
});

it('a failed upload does not block the next pick', async () => {
  mockUploadVideo.mockResolvedValue(null);
  mockOutcome = 'failed';
  const { result } = renderHook(() => useChatMediaSend(base));
  await act(async () => { result.current.start(VIDEO, 'video', ''); });
  await flush();
  expect(result.current.canStartNew()).toBe(true);
  expect(mockToast).not.toHaveBeenCalled();
});

describe('pendingHasLanded', () => {
  const p = { type: 'video', finalUrl: 'u' } as never;
  it('is false until the url is known and present in the list', () => {
    expect(pendingHasLanded(null, [])).toBe(false);
    expect(pendingHasLanded({ type: 'video', finalUrl: null } as never, [{ videoUrl: 'u' }])).toBe(false);
    expect(pendingHasLanded(p, [{ videoUrl: 'other' }])).toBe(false);
    expect(pendingHasLanded(p, [{ videoUrl: 'u' }])).toBe(true);
    expect(pendingHasLanded({ type: 'image', finalUrl: 'u' } as never, [{ imageURL: 'u' }])).toBe(true);
  });
});
