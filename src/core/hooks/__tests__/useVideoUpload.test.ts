import { renderHook, act } from '@testing-library/react-native';

const mockStart = jest.fn();
const mockUpload = jest.fn();
let snapCb: ((s: unknown) => void) | null = null;
const mockUnsub = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (_d: unknown, c: string, id: string) => ({ path: `${c}/${id}` }),
  onSnapshot: (_r: unknown, cb: (s: unknown) => void) => { snapCb = cb; return mockUnsub; },
}));
jest.mock('@core/firebase/storage', () => ({ uploadFile: (...a: unknown[]) => mockUpload(...a) }));
jest.mock('@core/video/compressForUpload', () => {
  class CompressionCancelled extends Error {}
  return { CompressionCancelled, startVideoCompression: (...a: unknown[]) => mockStart(...a) };
});

import { useVideoUpload } from '../useVideoUpload';
import { VIDEO_PROCESSING_TIMEOUT_MS } from '@core/constants/video';
import { CompressionCancelled } from '@core/video/compressForUpload';

const ASSET = { uri: 'file:///in.mov', type: 'video' } as never;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const snap = (data: unknown) => ({ exists: () => true, data: () => data });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  snapCb = null;
  (global as { fetch: unknown }).fetch = jest.fn(async () => ({ blob: async () => ({}) }));
  mockStart.mockImplementation((uri: string, _i: unknown, onProgress: (p: number) => void) => {
    onProgress(0.5);
    return { promise: Promise.resolve('file:///out.mp4'), cancel: jest.fn() };
  });
  mockUpload.mockImplementation(async (_p: string, _b: unknown, onProgress: (p: { percentage: number }) => void) => {
    onProgress({ percentage: 40 });
    return 'u';
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.useRealTimers());

it('walks compressing → uploading → processing → done and resolves the job url', async () => {
  const { result } = renderHook(() => useVideoUpload());
  let out: string | null = 'x';
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET).then((v) => { out = v; }); });
  await flush();
  expect(mockUpload).toHaveBeenCalled();
  expect(result.current.stage).toBe('processing');
  act(() => snapCb!(snap({ status: 'done', url: 'https://v/final.mp4' })));
  await flush();
  expect(out).toBe('https://v/final.mp4');
  expect(result.current.stage).toBe('idle');
  expect(result.current.url).toBe('https://v/final.mp4');
});

it('uploads the compressed file, not the original', async () => {
  const { result } = renderHook(() => useVideoUpload());
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET); });
  await flush();
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('file:///out.mp4');
});

it('reports upload failure as an error and resolves null', async () => {
  mockUpload.mockRejectedValue(new Error('network'));
  const { result } = renderHook(() => useVideoUpload());
  let out: string | null = 'x';
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET).then((v) => { out = v; }); });
  await flush();
  expect(out).toBeNull();
  expect(result.current.error).toBe('network');
  expect(result.current.stage).toBe('idle');
});

it('a retry after failure clears the error and runs again', async () => {
  mockUpload.mockRejectedValueOnce(new Error('network'));
  const { result } = renderHook(() => useVideoUpload());
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET); });
  await flush();
  expect(result.current.error).toBe('network');
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET); });
  await flush();
  expect(result.current.error).toBeNull();
  expect(result.current.stage).toBe('processing');
});

it('cancel during compression resolves null with no error', async () => {
  const cancel = jest.fn();
  let rejectIt!: (e: Error) => void;
  mockStart.mockReturnValue({ promise: new Promise<string>((_r, rej) => { rejectIt = rej; }), cancel });
  const { result } = renderHook(() => useVideoUpload());
  let out: string | null = 'x';
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET).then((v) => { out = v; }); });
  await flush();
  expect(result.current.stage).toBe('compressing');
  act(() => result.current.cancel());
  expect(cancel).toHaveBeenCalled();
  rejectIt(new CompressionCancelled());
  await flush();
  expect(out).toBeNull();
  expect(result.current.error).toBeNull();
  expect(result.current.stage).toBe('idle');
  expect(mockUpload).not.toHaveBeenCalled();
});

it('cancel during upload cancels the task and shows no error', async () => {
  let reject!: (e: Error) => void;
  const cancelTask = jest.fn(() => reject(new Error('storage/canceled')));
  mockUpload.mockImplementation((_p: string, _b: unknown, _o: unknown, _m: unknown, control: { cancel?: () => void }) => {
    control.cancel = cancelTask;
    return new Promise((_r, rej) => { reject = rej; });
  });
  const { result } = renderHook(() => useVideoUpload());
  let out: string | null = 'x';
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET).then((v) => { out = v; }); });
  await flush();
  expect(result.current.stage).toBe('uploading');
  act(() => result.current.cancel());
  await flush();
  expect(cancelTask).toHaveBeenCalled();
  expect(out).toBeNull();
  expect(result.current.error).toBeNull();
});

it('timeout sets slow but keeps listening, and a late done still resolves', async () => {
  const { result } = renderHook(() => useVideoUpload());
  let out: string | null = 'x';
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET).then((v) => { out = v; }); });
  await flush();
  act(() => { jest.advanceTimersByTime(VIDEO_PROCESSING_TIMEOUT_MS + 1); });
  expect(result.current.slow).toBe(true);
  expect(result.current.error).toBeNull();
  expect(result.current.stage).toBe('processing');
  expect(mockUnsub).not.toHaveBeenCalled();
  act(() => snapCb!(snap({ status: 'done', url: 'https://v/late.mp4' })));
  await flush();
  expect(out).toBe('https://v/late.mp4');
  expect(result.current.slow).toBe(false);
});

it('the processing timeout exceeds the server max (540 s)', () => {
  expect(VIDEO_PROCESSING_TIMEOUT_MS).toBeGreaterThan(540_000);
});

it('a job error surfaces as an error', async () => {
  const { result } = renderHook(() => useVideoUpload());
  act(() => { result.current.uploadVideo('portfolio', 'u1', ASSET); });
  await flush();
  act(() => snapCb!(snap({ status: 'error', error: 'boom' })));
  expect(result.current.error).toBe('boom');
});

describe('getOutcome (lets callers tell Cancel from a failure)', () => {
  it('ok after a done job', async () => {
    const { result } = renderHook(() => useVideoUpload());
    act(() => { result.current.uploadVideo('chat-videos', 'u1', ASSET); });
    await flush();
    act(() => snapCb!(snap({ status: 'done', url: 'https://v/a.mp4' })));
    expect(result.current.getOutcome()).toBe('ok');
  });

  it('failed after an upload error', async () => {
    mockUpload.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useVideoUpload());
    act(() => { result.current.uploadVideo('chat-videos', 'u1', ASSET); });
    await flush();
    expect(result.current.getOutcome()).toBe('failed');
  });

  it('cancelled after cancel(), and reset by the next run', async () => {
    const { result } = renderHook(() => useVideoUpload());
    act(() => { result.current.uploadVideo('chat-videos', 'u1', ASSET); });
    await flush();
    act(() => result.current.cancel());
    expect(result.current.getOutcome()).toBe('cancelled');
    act(() => { result.current.uploadVideo('chat-videos', 'u1', ASSET); });
    expect(result.current.getOutcome()).toBeNull();
  });
});
