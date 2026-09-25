/**
 * Every community membership change lands in the same write as its
 * communityEvents entry. The rules refuse an event that doesn't match a real
 * membership change in that write, so these tests pin the pairing.
 */

type Op = { kind: 'set' | 'update'; path: string; data: Record<string, unknown> };

const mockOps: Op[] = [];
let mockCommits = 0;
let mockTxDocs: Record<string, Record<string, unknown> | undefined> = {};

const mockWriter = () => ({
  set: (ref: { path: string }, data: Record<string, unknown>) => { mockOps.push({ kind: 'set', path: ref.path, data }); },
  update: (ref: { path: string }, data: Record<string, unknown>) => { mockOps.push({ kind: 'update', path: ref.path, data }); },
});

let mockAutoId = 0;
jest.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => {
    // doc(collectionRef) → auto id; doc(db, ...segments) → path
    if (args.length === 1) return { path: `${(args[0] as { path: string }).path}/auto${++mockAutoId}` };
    return { path: (args.slice(1) as string[]).join('/') };
  },
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  arrayUnion: (...v: string[]) => ({ op: 'union', v }),
  arrayRemove: (...v: string[]) => ({ op: 'remove', v }),
  serverTimestamp: () => 'SERVER_TS',
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => { mockOps.push({ kind: 'update', path: ref.path, data }); },
  writeBatch: () => ({ ...mockWriter(), commit: async () => { mockCommits++; } }),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => unknown) =>
    fn({
      ...mockWriter(),
      get: async (ref: { path: string }) => ({
        exists: () => mockTxDocs[ref.path] !== undefined,
        data: () => mockTxDocs[ref.path],
      }),
    }),
}));
jest.mock('@core/firebase/config', () => ({ db: {} }));

import {
  approveJoinRequest,
  approveAllJoinRequests,
  rejectJoinRequest,
  removeCommunityMember,
  leaveCommunity,
} from '../communityMembership';

const events = () => mockOps.filter((o) => o.path.startsWith('chats/c1/communityEvents/'));
const memberWrites = () => mockOps.filter((o) => o.path === 'chats/c1' && 'members' in o.data);

beforeEach(() => {
  mockOps.length = 0;
  mockCommits = 0;
  mockTxDocs = {};
});

describe('approveJoinRequest', () => {
  it('approves, adds the member and logs a join — together', async () => {
    mockTxDocs = { 'chats/c1/joinRequests/u1': { status: 'pending' }, 'chats/c1': { members: ['owner'] } };
    await expect(approveJoinRequest('c1', 'u1')).resolves.toBe(true);
    expect(mockOps.find((o) => o.path === 'chats/c1/joinRequests/u1')?.data).toEqual({
      status: 'approved',
      decidedAt: 'SERVER_TS',
    });
    expect(memberWrites()[0].data.members).toEqual({ op: 'union', v: ['u1'] });
    expect(events().map((e) => e.data)).toEqual([{ type: 'join', userId: 'u1', at: 'SERVER_TS' }]);
  });

  it('writes nothing when the request is no longer pending', async () => {
    mockTxDocs = { 'chats/c1/joinRequests/u1': { status: 'approved' }, 'chats/c1': { members: ['owner'] } };
    await expect(approveJoinRequest('c1', 'u1')).resolves.toBe(false);
    expect(mockOps).toHaveLength(0);
  });

  it('settles the request without a join when they are already a member', async () => {
    mockTxDocs = { 'chats/c1/joinRequests/u1': { status: 'pending' }, 'chats/c1': { members: ['owner', 'u1'] } };
    await approveJoinRequest('c1', 'u1');
    expect(memberWrites()).toHaveLength(0);
    expect(events()).toHaveLength(0);
    expect(mockOps).toHaveLength(1);
  });
});

describe('approveAllJoinRequests', () => {
  it('logs one join per new member and adds only them', async () => {
    await approveAllJoinRequests('c1', ['u1', 'u2', 'u3'], ['owner', 'u2']);
    expect(mockOps.filter((o) => o.path.includes('/joinRequests/'))).toHaveLength(3);
    expect(events().map((e) => e.data.userId)).toEqual(['u1', 'u3']);
    expect(memberWrites()[0].data.members).toEqual({ op: 'union', v: ['u1', 'u3'] });
    expect(mockCommits).toBe(1);
  });

  it('splits large approvals into batches under the 500-write cap', async () => {
    const ids = Array.from({ length: 160 }, (_, i) => `u${i}`);
    await approveAllJoinRequests('c1', ids, ['owner']);
    expect(mockCommits).toBe(2);
    expect(events()).toHaveLength(160);
  });
});

it('rejectJoinRequest only marks the request', async () => {
  await rejectJoinRequest('c1', 'u1');
  expect(mockOps).toEqual([
    { kind: 'update', path: 'chats/c1/joinRequests/u1', data: { status: 'rejected', decidedAt: 'SERVER_TS' } },
  ]);
});

describe('removeCommunityMember', () => {
  it('removes and logs a leave in one batch', async () => {
    await removeCommunityMember('c1', 'u1', 'owner');
    expect(memberWrites()[0].data.members).toEqual({ op: 'remove', v: ['u1'] });
    expect(events().map((e) => e.data)).toEqual([{ type: 'leave', userId: 'u1', at: 'SERVER_TS' }]);
    expect(mockCommits).toBe(1);
  });

  it('never removes the owner', async () => {
    await removeCommunityMember('c1', 'owner', 'owner');
    expect(mockOps).toHaveLength(0);
    expect(mockCommits).toBe(0);
  });
});

it('leaveCommunity removes self and logs a leave in one batch', async () => {
  await leaveCommunity('c1', 'u1');
  expect(memberWrites()[0].data.members).toEqual({ op: 'remove', v: ['u1'] });
  expect(events().map((e) => e.data.type)).toEqual(['leave']);
  expect(mockCommits).toBe(1);
});
