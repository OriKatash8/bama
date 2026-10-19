/**
 * refreshUsageStats is admin-only, throttled, and writes adminStats/usage (merge, never client-writable).
 */
const mockSets: { path: string; data: Record<string, unknown>; opts: unknown }[] = [];
let mockExisting: Record<string, unknown> | undefined;
const mockList = jest.fn();

jest.mock('firebase-admin', () => ({ apps: [{}], initializeApp: jest.fn(), app: () => ({ options: { projectId: 'p', storageBucket: 'app.bkt' } }) }));
jest.mock('@google-cloud/monitoring', () => ({ MetricServiceClient: class { listTimeSeries(r: unknown) { return mockList(r).then((x: unknown[]) => [x]); } } }));
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, h: unknown) => ({ run: h }) }));
jest.mock('../../lifecycle/helpers', () => {
  const { HttpsError } = jest.requireActual('firebase-functions/v2/https');
  return {
    requireAdmin: (t?: Record<string, unknown>) => { if (t?.role !== 'admin') throw new HttpsError('permission-denied', 'Admins only'); },
    FieldValue: { serverTimestamp: () => 'TS' },
    db: {
      doc: (path: string) => ({
        get: async () => ({ data: () => mockExisting }),
        set: async (data: Record<string, unknown>, opts: unknown) => { mockSets.push({ path, data, opts }); },
      }),
    },
  };
});

import { refreshUsageStats, collectUsageStats } from '../index';

const call = (auth: unknown) =>
  (refreshUsageStats as unknown as { run: (r: unknown) => Promise<{ ok: boolean; throttled: boolean; errors: string[] }> }).run({ auth, data: {} });

beforeEach(() => {
  mockSets.length = 0;
  mockExisting = undefined;
  mockList.mockReset().mockResolvedValue([]);
});

it('rejects a signed-out caller', async () => {
  await expect(call(undefined)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mockList).not.toHaveBeenCalled();
  expect(mockSets).toEqual([]);
});

it('rejects a signed-in non-admin', async () => {
  await expect(call({ uid: 'u', token: { role: 'client' } })).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(call({ uid: 'u', token: {} })).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mockList).not.toHaveBeenCalled();
  expect(mockSets).toEqual([]);
});

it('an admin refresh writes adminStats/usage with merge and an updatedAt', async () => {
  const res = await call({ uid: 'a', token: { role: 'admin' } });
  expect(res).toMatchObject({ ok: true, throttled: false });
  expect(mockSets).toHaveLength(1);
  expect(mockSets[0].path).toBe('adminStats/usage');
  expect(mockSets[0].opts).toEqual({ merge: true });
  expect(mockSets[0].data).toMatchObject({ updatedAt: 'TS', tz: 'America/Los_Angeles', project: 'p' });
});

it('throttles a second refresh within 30 s (no Monitoring calls, no write)', async () => {
  mockExisting = { updatedAt: { toMillis: () => Date.now() - 5_000 }, errors: [] };
  const res = await call({ uid: 'a', token: { role: 'admin' } });
  expect(res.throttled).toBe(true);
  expect(mockList).not.toHaveBeenCalled();
  expect(mockSets).toEqual([]);
});

it('runs again once the last snapshot is older than 30 s', async () => {
  mockExisting = { updatedAt: { toMillis: () => Date.now() - 60_000 } };
  const res = await call({ uid: 'a', token: { role: 'admin' } });
  expect(res.throttled).toBe(false);
  expect(mockSets).toHaveLength(1);
});

it('the hourly schedule runs the same collection', async () => {
  await (collectUsageStats as unknown as { run: () => Promise<void> }).run();
  expect(mockSets).toHaveLength(1);
});
