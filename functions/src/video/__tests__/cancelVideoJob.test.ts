/**
 * cancelVideoJob: only the owner of the path can cancel; the job id and the file it deletes
 * come from the verified path, never from the job doc or the client.
 */
const mockDocs = new Map<string, Record<string, unknown>>();
const mockSets: { path: string; data: Record<string, unknown>; opts?: unknown }[] = [];
const mockTxDeletes: string[] = [];
const mockFileDeletes: string[] = [];

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  app: () => ({ options: { storageBucket: 'bkt' } }),
  storage: () => ({
    bucket: (b: string) => ({ file: (p: string) => ({ delete: async () => { mockFileDeletes.push(`${b}/${p}`); } }) }),
  }),
}));
jest.mock('../../lifecycle/helpers', () => {
  const { HttpsError } = jest.requireActual('firebase-functions/v2/https');
  const ref = (path: string) => ({ path });
  return {
    requireAuth: (uid?: string) => { if (!uid) throw new HttpsError('unauthenticated', 'x'); return uid; },
    FieldValue: { serverTimestamp: () => 'TS' },
    db: {
      doc: ref,
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: async (r: { path: string }) => ({ exists: mockDocs.has(r.path), data: () => mockDocs.get(r.path) }),
          set: (r: { path: string }, data: Record<string, unknown>, opts?: unknown) => { mockSets.push({ path: r.path, data, opts }); },
          delete: (r: { path: string }) => { mockTxDeletes.push(r.path); },
        }),
    },
  };
});

import { cancelVideoJob } from '../cancel';
import { jobIdFor } from '../paths';

const call = (data: unknown, uid: string | null = 'alice') =>
  (cancelVideoJob as unknown as { run: (r: unknown) => Promise<{ ok: boolean; outcome: string }> })
    .run({ auth: uid ? { uid } : undefined, data });

const MINE = 'portfolio/alice/100.mp4';
const JOB = `videoJobs/${jobIdFor(MINE)}`;

beforeEach(() => {
  mockDocs.clear();
  mockSets.length = 0;
  mockTxDeletes.length = 0;
  mockFileDeletes.length = 0;
});

it('rejects an unauthenticated caller', async () => {
  await expect(call({ filePath: MINE }, null)).rejects.toMatchObject({ code: 'unauthenticated' });
  expect(mockSets).toEqual([]);
});

it('rejects another user\'s video path and touches nothing', async () => {
  await expect(call({ filePath: 'portfolio/bob/100.mp4' })).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mockSets).toEqual([]);
  expect(mockTxDeletes).toEqual([]);
  expect(mockFileDeletes).toEqual([]);
});

it.each([
  ['portfolio/alice/../bob/100.mp4'],
  ['portfolio/alice/../../users/alice.mp4'],
  ['portfolio/bob/../alice/100.mp4'],
  ['courses/alice/100.mp4'],
  ['portfolio/alice/100_compressed.mp4'],
  [''],
  [undefined],
  [{ a: 1 }],
])('rejects traversal / bad path %j', async (filePath) => {
  await expect(call({ filePath })).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mockSets).toEqual([]);
  expect(mockFileDeletes).toEqual([]);
});

it('rejects missing data', async () => {
  await expect(call(undefined)).rejects.toMatchObject({ code: 'permission-denied' });
});

it('processing / not-yet-created job: only marks it cancelled (merge), deletes no files', async () => {
  const res = await call({ filePath: MINE });
  expect(res).toEqual({ ok: true, outcome: 'marked' });
  expect(mockSets).toHaveLength(1);
  expect(mockSets[0]).toMatchObject({ path: JOB, opts: { merge: true } });
  expect(mockSets[0].data).toMatchObject({ cancelled: true, originalPath: MINE });
  expect(mockFileDeletes).toEqual([]);
});

it('done job: deletes the DERIVED compressed path and the job doc', async () => {
  // A tampered job doc must not steer the deletion.
  mockDocs.set(JOB, { status: 'done', originalPath: MINE, compressedPath: 'users/bob/secret.mp4' });
  const res = await call({ filePath: MINE });
  expect(res.outcome).toBe('delete-output');
  expect(mockTxDeletes).toEqual([JOB]);
  expect(mockFileDeletes).toContain('bkt/portfolio/alice/100_compressed.mp4');
  expect(mockFileDeletes.join()).not.toContain('secret');
});

it('refuses a job doc that names a different original', async () => {
  mockDocs.set(JOB, { status: 'done', originalPath: 'portfolio/bob/9.mp4' });
  await expect(call({ filePath: MINE })).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mockFileDeletes).toEqual([]);
  expect(mockTxDeletes).toEqual([]);
});
