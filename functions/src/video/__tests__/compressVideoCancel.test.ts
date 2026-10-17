/**
 * compressVideo honours a cancel mark on videoJobs/{id}: at start, after the encode, and at
 * the final write. In every case the output, the original and the job doc are removed and
 * the job is never marked done.
 */
const mockState = { job: undefined as Record<string, unknown> | undefined, cancelAfterEncode: false, cancelAtFinal: false };
const mockLog: string[] = [];

jest.mock('firebase-functions/v2', () => ({ storage: { onObjectFinalized: (_o: unknown, h: unknown) => ({ run: h }) } }));
jest.mock('fluent-ffmpeg', () => {
  const chain: Record<string, unknown> = {};
  chain.outputOptions = () => chain;
  chain.output = () => chain;
  chain.on = (ev: string, cb: () => void) => { if (ev === 'end') chain._end = cb; return chain; };
  chain.run = () => { mockLog.push('ffmpeg'); if (mockState.cancelAfterEncode) mockState.job = { ...mockState.job, cancelled: true }; (chain._end as () => void)(); };
  const f = () => chain;
  f.setFfmpegPath = () => {};
  return { __esModule: true, default: f };
});
jest.mock('ffmpeg-static', () => ({ __esModule: true, default: '/ffmpeg' }));
jest.mock('child_process', () => ({
  execFile: (_c: string, _a: string[], _o: unknown, cb: (...x: unknown[]) => void) =>
    cb(null, '', 'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'a\':\n  Duration: 00:00:02.00, start: 0, bitrate: 1000 kb/s\n  Stream #0:0: Video: h264, yuv420p, 1280x720, 30 fps\n'),
}));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: () => false, unlinkSync: jest.fn(), statSync: () => ({ size: 1000 }) }));

jest.mock('firebase-admin', () => {
  const docRef = (path: string) => ({
    path,
    get: async () => ({ exists: !!mockState.job, data: () => mockState.job }),
    delete: async () => { mockLog.push('job.delete'); mockState.job = undefined; },
    update: async () => { mockLog.push('job.update'); },
  });
  return {
    apps: [{}],
    initializeApp: jest.fn(),
    firestore: Object.assign(() => ({
      doc: docRef,
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        // simulate cancel landing right before the final transaction
        if (mockState.cancelAtFinal && mockLog.includes('upload')) mockState.job = { ...mockState.job, cancelled: true };
        return fn({
          get: async () => ({ exists: !!mockState.job, data: () => mockState.job }),
          set: (_r: unknown, d: Record<string, unknown>) => { mockLog.push('tx.set:' + d.status); mockState.job = d; },
          update: (_r: unknown, d: Record<string, unknown>) => { mockLog.push('tx.update:' + d.status); },
        });
      },
    }), { FieldValue: { serverTimestamp: () => 'TS' } }),
    storage: () => ({
      bucket: () => ({
        name: 'bkt',
        file: (p: string) => ({
          download: async () => { mockLog.push('download'); },
          delete: async () => { mockLog.push('del:' + p); },
        }),
        upload: async () => { mockLog.push('upload'); },
      }),
    }),
  };
});

import { compressVideo } from '../index';

const run = () =>
  (compressVideo as unknown as { run: (e: unknown) => Promise<void> }).run({
    data: { name: 'portfolio/u1/5.mp4', bucket: 'bkt', contentType: 'video/mp4', size: '1000' },
  });

beforeEach(() => {
  mockState.job = undefined;
  mockState.cancelAfterEncode = false;
  mockState.cancelAtFinal = false;
  mockLog.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

it('normal job: processing → done, original deleted', async () => {
  await run();
  expect(mockLog).toContain('tx.set:processing');
  expect(mockLog).toContain('tx.update:done');
  expect(mockLog).toContain('del:portfolio/u1/5.mp4');
});

it('cancelled before start: nothing downloaded or encoded, original and job removed', async () => {
  mockState.job = { cancelled: true };
  await run();
  expect(mockLog).not.toContain('download');
  expect(mockLog).not.toContain('ffmpeg');
  expect(mockLog).toEqual(['del:portfolio/u1/5.mp4', 'job.delete']);
});

it('cancelled during the encode: nothing uploaded, everything discarded', async () => {
  mockState.cancelAfterEncode = true;
  await run();
  expect(mockLog).not.toContain('upload');
  expect(mockLog).not.toContain('tx.update:done');
  expect(mockLog).toEqual(expect.arrayContaining(['del:portfolio/u1/5_compressed.mp4', 'del:portfolio/u1/5.mp4', 'job.delete']));
});

it('cancelled just before the final write: never marked done, output + original + job removed', async () => {
  mockState.cancelAtFinal = true;
  await run();
  expect(mockLog).toContain('upload');
  expect(mockLog).not.toContain('tx.update:done');
  expect(mockLog).toEqual(expect.arrayContaining(['del:portfolio/u1/5_compressed.mp4', 'del:portfolio/u1/5.mp4', 'job.delete']));
});
