/**
 * blockUser: the block and its admin report are written together, once.
 */
const mockWrites: { path: string; data: Record<string, unknown> }[] = [];
const mockDocs = new Map<string, Record<string, unknown>>();
let mockReportSeq = 0;

jest.mock('firebase-admin', () => ({ apps: [{}], initializeApp: jest.fn() }));
jest.mock('../../system', () => ({ SYSTEM_USER_ID: 'bama-system' }));
jest.mock('../../lifecycle/helpers', () => {
  const { HttpsError } = jest.requireActual('firebase-functions/v2/https');
  const ref = (path: string) => ({ path });
  return {
    requireAuth: (uid?: string) => { if (!uid) throw new HttpsError('unauthenticated', 'x'); return uid; },
    FieldValue: { serverTimestamp: () => 'TS' },
    db: {
      doc: ref,
      collection: () => ({ doc: () => ref(`reports/r${++mockReportSeq}`) }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: async (r: { path: string }) => ({ exists: mockDocs.has(r.path), data: () => mockDocs.get(r.path) }),
          set: (r: { path: string }, data: Record<string, unknown>) => { mockWrites.push({ path: r.path, data }); },
        }),
    },
  };
});

import { blockUser, normalizeContext } from '../blocking';

const call = (data: Record<string, unknown>, uid: string | null = 'alice') =>
  (blockUser as unknown as { run: (r: unknown) => Promise<{ success: boolean; alreadyBlocked: boolean }> })
    .run({ auth: uid ? { uid } : undefined, data });

beforeEach(() => {
  mockWrites.length = 0;
  mockDocs.clear();
  mockReportSeq = 0;
  mockDocs.set('users/alice', { displayName: 'Alice' });
  mockDocs.set('users/bob', { displayName: 'Bob' });
});

describe('blockUser', () => {
  it('writes the block and a user_blocked report together', async () => {
    const res = await call({ targetUid: 'bob', context: 'dm', chatId: 'c1' });
    expect(res).toEqual({ success: true, alreadyBlocked: false });
    expect(mockWrites.map((w) => w.path)).toEqual(['users/alice/blocks/bob', 'reports/r1']);
    expect(mockWrites[0].data).toEqual({ blockedAt: 'TS' });
    expect(mockWrites[1].data).toMatchObject({
      type: 'user_blocked', reporterId: 'alice', reportedUserId: 'bob',
      reportedUserName: 'Bob', context: 'dm', chatId: 'c1', status: 'pending',
    });
  });

  it('is idempotent: a second block files no second report', async () => {
    mockDocs.set('users/alice/blocks/bob', { blockedAt: 'x' });
    const res = await call({ targetUid: 'bob' });
    expect(res.alreadyBlocked).toBe(true);
    expect(mockWrites).toEqual([]);
  });

  it('refuses yourself, the system account, a missing user and anonymous callers', async () => {
    await expect(call({ targetUid: 'alice' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call({ targetUid: 'bama-system' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(call({ targetUid: 'ghost' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(call({})).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call({ targetUid: 'bob' }, null)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mockWrites).toEqual([]);
  });

  it('stores only known contexts', () => {
    expect(normalizeContext('dm')).toBe('dm');
    expect(normalizeContext('<script>')).toBe('other');
  });
});
