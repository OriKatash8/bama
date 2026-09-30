/**
 * Deleting (= cancelling) a project removes the offers nobody accepted. A pro
 * who offered on it, and the client who deleted it, both stopped seeing a
 * pending offer on a project that no longer exists. Accepted / rejected /
 * removed offers stay: they are the hired pros' record of the job.
 * Run against an in-memory Firestore.
 */

import { deletePendingOffers } from '../offerCleanup';

type Doc = Record<string, unknown>;
const mockStore = new Map<string, Doc>();
const mockBatchSizes: number[] = [];

jest.mock('../helpers', () => {
  const ref = (path: string) => ({ path });
  const query = (coll: string, filters: [string, unknown][]) => ({
    where: (field: string, _op: string, value: unknown) => query(coll, [...filters, [field, value]]),
    get: async () => ({
      docs: [...mockStore.entries()]
        .filter(([p, d]) => p.startsWith(`${coll}/`) && filters.every(([f, v]) => d[f] === v))
        .map(([p]) => ({ ref: ref(p) })),
      get size() { return this.docs.length; },
    }),
  });
  return {
    db: {
      collection: (c: string) => query(c, []),
      batch: () => {
        const dels: string[] = [];
        return {
          delete: (r: { path: string }) => { dels.push(r.path); },
          commit: async () => { mockBatchSizes.push(dels.length); dels.forEach((p) => mockStore.delete(p)); },
        };
      },
    },
  };
});

beforeEach(() => {
  mockStore.clear();
  mockBatchSizes.length = 0;
  mockStore.set('priceOffers/a', { projectId: 'p1', status: 'pending' });
  mockStore.set('priceOffers/b', { projectId: 'p1', status: 'accepted' });
  mockStore.set('priceOffers/c', { projectId: 'p1', status: 'rejected' });
  mockStore.set('priceOffers/d', { projectId: 'p2', status: 'pending' });
  mockStore.set('bundleOffers/x', { projectId: 'p1', status: 'pending' });
  mockStore.set('bundleOffers/y', { projectId: 'p2', status: 'pending' });
});

it('deletes the project\'s pending price and bundle offers', async () => {
  const res = await deletePendingOffers('p1');
  expect(mockStore.has('priceOffers/a')).toBe(false);
  expect(mockStore.has('bundleOffers/x')).toBe(false);
  expect(res).toEqual({ priceOffers: 1, bundleOffers: 1 });
});

it('keeps accepted and rejected offers', async () => {
  await deletePendingOffers('p1');
  expect(mockStore.has('priceOffers/b')).toBe(true);
  expect(mockStore.has('priceOffers/c')).toBe(true);
});

it('never touches another project\'s offers', async () => {
  await deletePendingOffers('p1');
  expect(mockStore.has('priceOffers/d')).toBe(true);
  expect(mockStore.has('bundleOffers/y')).toBe(true);
});

it('nothing pending: no write at all', async () => {
  await deletePendingOffers('p3');
  expect(mockBatchSizes).toEqual([]);
});

it('more offers than one batch holds: chunked', async () => {
  for (let i = 0; i < 450; i++) mockStore.set(`priceOffers/m${i}`, { projectId: 'p4', status: 'pending' });
  await deletePendingOffers('p4');
  expect(mockBatchSizes).toEqual([400, 50]);
  expect([...mockStore.keys()].some((k) => k.startsWith('priceOffers/m'))).toBe(false);
});
