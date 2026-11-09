import { Platform, TurboModuleRegistry } from 'react-native';

type Cb = (p?: never) => void;
const handlers: Record<string, Cb> = {};
const removed: string[] = [];
const sub = (name: string) => (cb: Cb) => { handlers[name] = cb; return { remove: () => removed.push(name) }; };
const mockShowEditor = jest.fn();
const mockCleanFiles = jest.fn(async () => 1);
jest.mock('react-native-video-trim', () => ({
  __esModule: true,
  default: {
    onFinishTrimming: (cb: Cb) => sub('finish')(cb),
    onCancel: (cb: Cb) => sub('cancel')(cb),
    onError: (cb: Cb) => sub('error')(cb),
    onHide: (cb: Cb) => sub('hide')(cb),
  },
  showEditor: (...a: unknown[]) => mockShowEditor(...a),
  cleanFiles: () => mockCleanFiles(),
}));

let mockEnabled = true;
jest.mock('@core/constants/video', () => ({
  get VIDEO_TRIM_ENABLED() { return mockEnabled; },
}));

import { canTrimVideo, cleanTrimmedFiles, openVideoTrimmer } from '../trimVideo';

const labels = { done: 'Done', cancel: 'Cancel', working: 'Trimming…', failedTitle: 'T', failedBody: 'B', failedClose: 'C' };
const open = (maxDurationMs?: number) => openVideoTrimmer('file:///in.mov', { maxDurationMs, labels, accent: '#004aad' });
const fire = (name: string, payload?: unknown) => (handlers[name] as unknown as (p?: unknown) => void)(payload);

let mockNative: object | null = {};
beforeEach(() => {
  jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((() => mockNative) as never);
  mockNative = {};
  jest.useFakeTimers();
  jest.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  removed.length = 0;
  mockEnabled = true;
  (Platform as { OS: string }).OS = 'ios';
});
afterEach(() => jest.useRealTimers());

describe('the editor is configured for a plain, precise cut', () => {
  it('precise, nothing saved or shared, tools off, capped at maxDuration', async () => {
    void open(180_000);
    expect(mockShowEditor).toHaveBeenCalledTimes(1);
    const [uri, cfg] = mockShowEditor.mock.calls[0];
    expect(uri).toBe('file:///in.mov');
    expect(cfg).toEqual(expect.objectContaining({
      enablePreciseTrimming: true,
      saveToPhoto: false,
      openDocumentsOnFinish: false,
      openShareSheetOnFinish: false,
      enableEditTools: false,
      maxDuration: 180_000,
      outputExt: 'mp4',
      type: 'video',
      trimmerColor: '#004aad',
      saveButtonText: 'Done',
    }));
  });
  it('no cap when none is given', () => {
    void open();
    expect(mockShowEditor.mock.calls[0][1].maxDuration).toBe(-1);
  });
});

describe('result', () => {
  it('resolves with a file:// uri and the duration once the editor is hidden', async () => {
    const p = open(180_000);
    fire('finish', { outputPath: '/var/tmp/out.mp4', duration: 61_000, startTime: 0, endTime: 61_000 });
    fire('hide');
    jest.advanceTimersByTime(200);
    await expect(p).resolves.toEqual({ uri: 'file:///var/tmp/out.mp4', durationMs: 61_000 });
    expect(removed).toEqual(expect.arrayContaining(['finish', 'cancel', 'error', 'hide']));
  });
  it('does not double-prefix a path that already has a scheme', async () => {
    const p = open();
    fire('finish', { outputPath: 'file:///x/out.mp4', duration: 1000 });
    fire('hide');
    jest.advanceTimersByTime(200);
    await expect(p).resolves.toEqual({ uri: 'file:///x/out.mp4', durationMs: 1000 });
  });
  it('waits for the editor to leave the screen before resolving', async () => {
    let done = false;
    const p = open().then((v) => { done = true; return v; });
    fire('finish', { outputPath: '/o.mp4', duration: 1000 });
    await Promise.resolve();
    expect(done).toBe(false); // still dismissing
    fire('hide');
    jest.advanceTimersByTime(200);
    await p;
    expect(done).toBe(true);
  });
  it('still resolves with the cut if "hidden" never arrives', async () => {
    const p = open();
    fire('finish', { outputPath: '/o.mp4', duration: 1000 });
    jest.advanceTimersByTime(2000);
    await expect(p).resolves.toEqual({ uri: 'file:///o.mp4', durationMs: 1000 });
  });
});

describe('backing out and failing', () => {
  it('cancel -> null', async () => {
    const p = open();
    fire('cancel');
    fire('hide');
    jest.advanceTimersByTime(200);
    await expect(p).resolves.toBeNull();
  });
  it('hidden with nothing finished -> null', async () => {
    const p = open();
    fire('hide');
    jest.advanceTimersByTime(200);
    await expect(p).resolves.toBeNull();
  });
  it('an error -> null', async () => {
    const p = open();
    fire('error', { message: 'x', errorCode: 'y' });
    fire('hide');
    jest.advanceTimersByTime(200);
    await expect(p).resolves.toBeNull();
  });
  it('showEditor throwing -> null, not a crash', async () => {
    mockShowEditor.mockImplementationOnce(() => { throw new Error('native'); });
    await expect(open()).resolves.toBeNull();
  });
});

describe('kill switch', () => {
  it('is on for native when the flag is on', () => {
    expect(canTrimVideo()).toBe(true);
  });
  it('is off when VIDEO_TRIM_ENABLED is false', () => {
    mockEnabled = false;
    expect(canTrimVideo()).toBe(false);
  });
  it('is off when this binary has no VideoTrim module (JS updated, native not rebuilt)', () => {
    mockNative = null;
    expect(canTrimVideo()).toBe(false);
  });
  it('is off if asking the registry throws', () => {
    (TurboModuleRegistry.get as jest.Mock).mockImplementation(() => { throw new Error('x'); });
    expect(canTrimVideo()).toBe(false);
  });
  it('is off on web whatever the flag says', () => {
    (Platform as { OS: string }).OS = 'web';
    expect(canTrimVideo()).toBe(false);
  });
  it('cleaning is a no-op when off', () => {
    mockEnabled = false;
    cleanTrimmedFiles();
    expect(mockCleanFiles).not.toHaveBeenCalled();
  });
  it('cleaning deletes the library outputs when on, and never throws', async () => {
    cleanTrimmedFiles();
    expect(mockCleanFiles).toHaveBeenCalled();
    mockCleanFiles.mockRejectedValueOnce(new Error('x'));
    expect(() => cleanTrimmedFiles()).not.toThrow();
  });
});

it('openVideoTrimmer resolves null instead of throwing when the module cannot be loaded', async () => {
  jest.resetModules();
  jest.doMock('react-native-video-trim', () => { throw new Error("'VideoTrim' could not be found"); });
  const { openVideoTrimmer: open2 } = require('../trimVideo');
  await expect(open2('file:///in.mov', { labels, accent: '#000' })).resolves.toBeNull();
  jest.dontMock('react-native-video-trim');
});
