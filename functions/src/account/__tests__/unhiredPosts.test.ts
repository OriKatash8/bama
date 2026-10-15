import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deleting an account removes its open posts that nobody was hired on, with
 * their offers and the notifications that point at them. A post with any sign
 * of a hire is left alone.
 */

type Doc = { path: string; data: Record<string, unknown> };
let store: Doc[] = [];
const mockDeleted: string[] = [];

const ref = (path: string) => ({ path, collection: (name: string) => mockCol(`${path}/${name}`) });
function mockCol(prefix: string) {
  const docsOf = (pred: (d: Doc) => boolean) => ({
    get: async () => {
      const docs = store.filter(pred).map((d) => ({ id: d.path.split('/').pop(), ref: ref(d.path), data: () => d.data }));
      return { docs, size: docs.length };
    },
  });
  const inCol = (d: Doc) => d.path.startsWith(`${prefix}/`) && d.path.split('/').length === prefix.split('/').length + 1;
  return {
    get: docsOf(inCol).get,
    where: (field: string, _op: string, value: unknown) =>
      docsOf((d) => inCol(d) && field.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], d.data) === value),
  };
}

jest.mock('../../lifecycle/helpers', () => ({ db: { collection: (name: string) => mockCol(name) } }));
jest.mock('../../lifecycle/offerCleanup', () => ({
  deleteInChunks: async (refs: { path: string }[]) => { refs.forEach((r) => mockDeleted.push(r.path)); },
}));

import { deleteUnhiredOpenPosts, isUnhiredOpenPost } from '../unhiredPosts';

const OPEN = { status: 'open', clientId: 'u1', professionalIds: [], filledSlots: [] };
const seed = (id: string, data: Record<string, unknown>): Doc => ({ path: `projects/${id}`, data: { ...OPEN, ...data } });

beforeEach(() => { store = []; mockDeleted.length = 0; });

describe('isUnhiredOpenPost', () => {
  it('is true for an open post with no sign of a hire', () => {
    expect(isUnhiredOpenPost(OPEN, 0, false)).toBe(true);
  });
  it.each([
    ['not open', { status: 'in_progress' }, 0, false],
    ['cancelled', { status: 'cancelled' }, 0, false],
    ['has a chat', { chatId: 'c1' }, 0, false],
    ['has professionalIds', { professionalIds: ['p1'] }, 0, false],
    ['has slotHolders', { slotHolders: ['p1'] }, 0, false],
    ['has a filled slot', { filledSlots: [{ category: 'Editor' }] }, 0, false],
    ['has a fee doc', {}, 1, false],
    ['has an accepted offer', {}, 0, true],
  ])('is false when %s', (_n, over, fees, accepted) => {
    expect(isUnhiredOpenPost({ ...OPEN, ...over }, fees, accepted)).toBe(false);
  });
});

describe('deleteUnhiredOpenPosts', () => {
  it('removes the post, its offers and its notifications, the project last', async () => {
    store = [
      seed('p1', {}),
      { path: 'priceOffers/o1', data: { projectId: 'p1', status: 'pending' } },
      { path: 'priceOffers/o2', data: { projectId: 'p1', status: 'rejected' } },
      { path: 'bundleOffers/b1', data: { projectId: 'p1', status: 'pending' } },
      { path: 'notifications/n1', data: { data: { projectId: 'p1' } } },
      { path: 'notifications/other', data: { data: { projectId: 'p9' } } },
      { path: 'priceOffers/elsewhere', data: { projectId: 'p9', status: 'pending' } },
    ];
    const res = await deleteUnhiredOpenPosts('u1');
    expect(res).toEqual({ removed: ['p1'], kept: [] });
    expect(mockDeleted.sort()).toEqual(['bundleOffers/b1', 'notifications/n1', 'priceOffers/o1', 'priceOffers/o2', 'projects/p1'].sort());
  });

  it('keeps a post with a chat, a hire, a fee or an accepted offer, and deletes nothing of it', async () => {
    store = [
      seed('chat', { chatId: 'c1' }),
      seed('hired', { professionalIds: ['p1'] }),
      seed('fee', {}),
      { path: 'projects/fee/fees/p1', data: { professionalId: 'p1' } },
      seed('acc', {}),
      { path: 'priceOffers/oa', data: { projectId: 'acc', status: 'accepted' } },
    ];
    const res = await deleteUnhiredOpenPosts('u1');
    expect(res.removed).toEqual([]);
    expect(res.kept.sort()).toEqual(['acc', 'chat', 'fee', 'hired']);
    expect(mockDeleted).toEqual([]);
  });

  it('leaves closed posts and other people’s posts alone', async () => {
    store = [seed('done', { status: 'completed' }), seed('theirs', { clientId: 'u2' })];
    const res = await deleteUnhiredOpenPosts('u1');
    expect(res).toEqual({ removed: [], kept: [] });
    expect(mockDeleted).toEqual([]);
  });
});

describe('deleteMyAccount wiring', () => {
  const SRC = readFileSync(join(__dirname, '..', 'deletion.ts'), 'utf8');
  const call = SRC.slice(SRC.indexOf('export const deleteMyAccount'));

  it('removes the open posts before the irreversible Auth deletion', () => {
    const at = call.indexOf('deleteUnhiredOpenPosts(uid)');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(call.indexOf('admin.auth().deleteUser(uid)'));
  });

  it('a failure there is caught, so it can never stop the deletion', () => {
    const at = call.indexOf('deleteUnhiredOpenPosts(uid)');
    expect(call.slice(call.lastIndexOf('try {', at), at)).toMatch(/try \{\s*const/);
    expect(call.slice(at, call.indexOf('// 3. Devices'))).toMatch(/catch \(e\)/);
  });
});
