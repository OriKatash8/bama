import { mockDb, Timestamp } from '../../payments/__fixtures__/memoryHelpers';
import { adminUserActivity, paginate, parseCursor, feeItemOf, PAGE_SIZE, FETCH_CAP } from '../userActivity';

/**
 * adminUserActivity: ADMIN ONLY, lazy sections, nothing private. Run against the in-memory Firestore.
 */
jest.mock('../../lifecycle/helpers', () => {
  const m = require('../../payments/__fixtures__/memoryHelpers').mockHelpers;
  return {
    ...m,
    requireAdmin: (t: { role?: string } | undefined) => {
      if (t?.role !== 'admin') throw Object.assign(new Error('Admins only'), { code: 'permission-denied' });
    },
  };
});
jest.mock('firebase-functions/v2/https', () => ({
  ...jest.requireActual('firebase-functions/v2/https'),
  onCall: (a: unknown, b: unknown) => (typeof a === 'function' ? a : b),
}));

const U = 'user1';
const T = (d: number) => Timestamp.fromMillis(Date.UTC(2026, 10, d));
const admin = { auth: { uid: 'admin1', token: { role: 'admin' } } };
const call = (data: Record<string, unknown>, req: Record<string, unknown> = admin) =>
  (adminUserActivity as unknown as (r: unknown) => Promise<any>)({ ...req, data });

function seedWorld() {
  mockDb.reset();
  mockDb.seed(`users/${U}`, { displayName: 'Dana Pro', moderation: undefined });
  mockDb.seed('users/c1', { displayName: 'Cleo Client' });
  mockDb.seed('users/p2', { displayName: 'Pablo Pro' });
  mockDb.seed('users/r1', { displayName: 'Rita Reporter' });
  // moderation
  mockDb.seed('adminActions/a1', { action: 'warn', targetUserId: U, actorName: 'Admin', reason: 'Spam', createdAt: T(3) });
  mockDb.seed('adminActions/a2', { action: 'suspend', targetUserId: U, actorName: 'Admin', reason: 'Worse', createdAt: T(5) });
  mockDb.seed('reports/rp1', { reportedUserId: U, reporterId: 'r1', reason: 'Rude', snippet: 'x'.repeat(500), status: 'pending', type: undefined, targetType: 'message', createdAt: T(4) });
  mockDb.seed('reports/rp2', { reportedUserId: 'c1', reporterId: U, reason: 'Late', status: 'resolved', createdAt: T(2) });
  // projects: one as professional (with a fee), one as client
  mockDb.seed('projects/pA', { title: 'Wedding', status: 'completed', clientId: 'c1', professionalIds: [U], chatId: 'chA', createdAt: T(1), completedAt: T(6) });
  mockDb.seed('projects/pB', { title: 'Promo', status: 'open', clientId: U, professionalIds: ['p2'], chatId: 'chB', createdAt: T(7) });
  mockDb.seed(`projects/pA/fees/${U}`, {
    professionalId: U, projectId: 'pA', engagementStatus: 'disputed', status: 'not_owed', baseAmount: 1000, feeDue: 0, feePaid: false,
    hiredAt: T(1), disputedAt: T(8), adminReview: { reason: 'didnt_happen' }, disputeReason: 'never happened', preDispute: { feeDue: 30 },
    providerRef: 'ref-1', paymentLink: { processId: 'proc1', amount: 30, createdAt: T(8), superseded: true },
    // things that must NEVER be returned
    cardToken: 'SECRET-TOKEN', phone: '+972500000000',
  });
  mockDb.seed('projects/pB/fees/p2', {
    professionalId: 'p2', projectId: 'pB', engagementStatus: 'completed', status: 'pending', baseAmount: 500, feeDue: 15, feePaid: false,
    resolvedAt: T(9), resolvedOutcome: 'completed', disputedAt: T(8),
  });
  mockDb.seed('feeBlocks/user1', { blockedFrom: T(20) });
  // reviews
  mockDb.seed('reviews/pA_user1', { projectId: 'pA', professionalId: U, reviewerId: 'c1', authorId: 'c1', rating: 5, body: 'great', published: false, heldForDispute: true, authorName: 'Cleo Client', createdAt: T(6) });
  mockDb.seed('reviews/gv1', { projectId: 'pB', professionalId: 'p2', reviewerId: U, authorId: U, rating: 4, text: 'ok', published: true, createdAt: T(10) });
  mockDb.seed('reviews/legacy', { projectId: 'pX', professionalId: 'p2', authorId: U, rating: 3, body: 'legacy', createdAt: T(1) });
  // communities
  mockDb.seed('chats/cm1', { type: 'community', name: 'Gaffers', ownerId: U, members: [U, 'c1'], status: 'active', createdAt: T(1) });
  mockDb.seed('chats/cm2', { type: 'community', name: 'Grips', ownerId: 'c1', members: ['c1', U], status: 'suspended', createdAt: T(2) });
  mockDb.seed('chats/dm1', { type: 'direct', members: [U, 'c1'], createdAt: T(3) });
}
beforeEach(seedWorld);

describe('who may call it (nothing is read for anyone else)', () => {
  it.each([
    ['a signed-in non-admin', { auth: { uid: 'u', token: {} } }],
    ['a client-role token', { auth: { uid: 'u', token: { role: 'client' } } }],
  ])('%s is refused with permission-denied, before any read', async (_l, req) => {
    const spy = jest.spyOn(mockDb, 'collection');
    await expect(call({ uid: U, section: 'moderation' }, req)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('an unauthenticated caller is refused', async () => {
    await expect(call({ uid: U, section: 'moderation' }, { auth: undefined })).rejects.toBeDefined();
  });
});

describe('input validation', () => {
  it.each([[{ section: 'moderation' }], [{ uid: '', section: 'moderation' }], [{ uid: 'a/b', section: 'moderation' }], [{ uid: 'x'.repeat(200), section: 'moderation' }]])(
    'a bad uid %p', async (data) => { await expect(call(data)).rejects.toMatchObject({ code: 'invalid-argument' }); },
  );
  it('an unknown section', async () => { await expect(call({ uid: U, section: 'passwords' })).rejects.toMatchObject({ message: 'unknown-section' }); });
  it.each([['abc'], ['-1'], ['1.5'], [12]])('a bad cursor %p', async (cursor) => {
    await expect(call({ uid: U, section: 'moderation', cursor })).rejects.toMatchObject({ message: 'bad-cursor' });
  });
});

describe('paging', () => {
  it('sorts newest first and pages by an offset cursor', () => {
    const all = Array.from({ length: 45 }, (_, i) => ({ id: i, at: i }));
    const p1 = paginate(all, undefined);
    expect(p1.items).toHaveLength(PAGE_SIZE);
    expect(p1.items[0].id).toBe(44);
    expect(p1.nextCursor).toBe(String(PAGE_SIZE));
    expect(p1.total).toBe(45);
    const p3 = paginate(all, '40');
    expect(p3.items.map((i) => i.id)).toEqual([4, 3, 2, 1, 0]);
    expect(p3.nextCursor).toBeNull();
  });
  it('an empty list and a missing date are fine', () => {
    expect(paginate([], '')).toEqual({ items: [], nextCursor: null, total: 0 });
    expect(paginate([{ at: null }, { at: 5 }], '').items[0].at).toBe(5);
  });
  it('parseCursor: empty is the first page', () => { expect(parseCursor(undefined)).toBe(0); expect(parseCursor('')).toBe(0); expect(parseCursor('20')).toBe(20); });
  it('the caps are what the design says', () => { expect(PAGE_SIZE).toBe(20); expect(FETCH_CAP).toBe(200); });
});

describe('moderation', () => {
  it('returns the actions and the reports filed AND received, newest first, each report with the other person by name', async () => {
    const r = await call({ uid: U, section: 'moderation' });
    expect(r.section).toBe('moderation');
    expect(r.items.map((i: any) => i.id)).toEqual(['a2', 'rp1', 'a1', 'rp2']);
    const received = r.items.find((i: any) => i.id === 'rp1');
    expect(received).toMatchObject({ kind: 'report_received', other: { uid: 'r1', name: 'Rita Reporter' }, status: 'pending', targetType: 'message' });
    expect(received.snippet).toHaveLength(200); // clipped
    expect(r.items.find((i: any) => i.id === 'rp2')).toMatchObject({ kind: 'report_filed', other: { uid: 'c1', name: 'Cleo Client' } });
    expect(r.items.find((i: any) => i.id === 'a2')).toMatchObject({ kind: 'action', action: 'suspend', reason: 'Worse' });
  });
  it('a person with nothing recorded gets an empty page, not an error', async () => {
    const r = await call({ uid: 'nobody', section: 'moderation' });
    expect(r).toMatchObject({ items: [], nextCursor: null, total: 0, truncated: false });
  });
});

describe('projects', () => {
  it('lists projects as client and as professional, with the other side by name and the engagement', async () => {
    const r = await call({ uid: U, section: 'projects' });
    expect(r.items.map((i: any) => i.projectId)).toEqual(['pB', 'pA']);
    expect(r.items[0]).toMatchObject({ roles: ['client'], others: [{ uid: 'p2', name: 'Pablo Pro' }], chatId: 'chB', engagement: null });
    expect(r.items[1]).toMatchObject({ roles: ['professional'], others: [{ uid: 'c1', name: 'Cleo Client' }], engagement: { status: 'disputed', amount: 1000 } });
  });
  it('someone who is both client and professional on one project has both roles, once', async () => {
    mockDb.seed('projects/pC', { title: 'Self', status: 'open', clientId: U, professionalIds: [U], createdAt: T(11) });
    const r = await call({ uid: U, section: 'projects' });
    const hits = r.items.filter((i: any) => i.projectId === 'pC');
    expect(hits).toHaveLength(1);
    expect(hits[0].roles.sort()).toEqual(['client', 'professional']);
  });
});

describe('fees and payments', () => {
  it('returns the amounts, how it was settled, the link, and a summary on the first page', async () => {
    const r = await call({ uid: U, section: 'fees' });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      projectId: 'pA', title: 'Wedding', baseAmount: 1000, feeDue: 0, feePaid: false, providerRef: 'ref-1',
      paymentLink: { processId: 'proc1', amount: 30, superseded: true },
    });
    expect(r.summary).toMatchObject({ owed: 0, open: 0, blockedFrom: Date.UTC(2026, 10, 20) });
  });
  it('the summary counts owed money from unpaid fees, and is only on the first page', async () => {
    mockDb.seed('projects/pZ/fees/user1', { professionalId: U, projectId: 'pZ', feeDue: 40, feePaid: false, hiredAt: T(12) });
    const first = await call({ uid: U, section: 'fees' });
    expect(first.summary).toMatchObject({ owed: 40, open: 1 });
    mockDb.seed('x', {});
    const again = await call({ uid: U, section: 'fees', cursor: '20' });
    expect(again.summary).toBeUndefined();
  });
  it('feeItemOf shapes a review reason from either kind of review', () => {
    expect(feeItemOf('p', 't', { linkReview: { reason: 'link_superseded' } }).review).toBe('link_superseded');
    expect(feeItemOf('p', 't', { chargeReview: { reason: 'settle_mismatch' } }).review).toBe('settle_mismatch');
    expect(feeItemOf('p', 't', {}).review).toBeNull();
  });
});

describe('disputes', () => {
  it('as the professional: open dispute with its note, original fee and the HELD review', async () => {
    const r = await call({ uid: U, section: 'disputes' });
    const mine = r.items.find((i: any) => i.role === 'professional');
    expect(mine).toMatchObject({
      projectId: 'pA', title: 'Wedding', state: 'open', reason: 'didnt_happen', note: 'never happened', originalFee: 30,
      pro: { uid: U, name: 'Dana Pro' },
      heldReview: { rating: 5, text: 'great', authorName: 'Cleo Client' },
    });
  });
  it('as the client: a dispute raised on their project, resolved, with the outcome', async () => {
    const r = await call({ uid: U, section: 'disputes' });
    const raised = r.items.find((i: any) => i.role === 'client');
    expect(raised).toMatchObject({ projectId: 'pB', state: 'resolved', outcome: 'completed', pro: { uid: 'p2', name: 'Pablo Pro' }, heldReview: null });
  });
});

describe('reviews', () => {
  it('lists received and given (including legacy authorId-only), counted once, held ones flagged', async () => {
    const r = await call({ uid: U, section: 'reviews' });
    const by = (id: string) => r.items.find((i: any) => i.id === id);
    expect(by('pA_user1')).toMatchObject({ direction: 'received', rating: 5, held: true, published: false, other: { uid: 'c1', name: 'Cleo Client' } });
    expect(by('gv1')).toMatchObject({ direction: 'given', rating: 4, held: false, published: true, other: { uid: 'p2', name: 'Pablo Pro' } });
    expect(by('legacy')).toMatchObject({ direction: 'given', text: 'legacy' });
    expect(r.total).toBe(3);
  });
});

describe('communities', () => {
  it('lists owned and joined communities only (not direct chats), with role and status', async () => {
    const r = await call({ uid: U, section: 'communities' });
    expect(r.items.map((i: any) => [i.name, i.role, i.status])).toEqual([['Grips', 'member', 'suspended'], ['Gaffers', 'owner', 'active']]);
    expect(r.items.find((i: any) => i.name === 'Gaffers').memberCount).toBe(2);
  });
});

describe('summary', () => {
  it('counts every tab in one call', async () => {
    const { summary } = await call({ uid: U, section: 'summary' });
    expect(summary).toEqual({
      moderation: { actions: 2, reportsReceived: 1, reportsFiled: 1 },
      projects: { asClient: 1, asProfessional: 1 },
      fees: { records: 1, open: 0, owed: 0, blockedFrom: Date.UTC(2026, 10, 20) },
      disputes: { open: 1, resolved: 0 },
      reviews: { received: 1, given: 1, held: 1 },
      communities: { owned: 1, member: 2 },
    });
  });
});

describe('what it never returns', () => {
  it('no section leaks tokens, phone numbers or anyone else\'s email', async () => {
    const all = JSON.stringify(await Promise.all(
      ['moderation', 'projects', 'fees', 'disputes', 'reviews', 'communities', 'summary'].map((section) => call({ uid: U, section })),
    ));
    expect(all).not.toContain('SECRET-TOKEN');
    expect(all).not.toContain('+972500000000');
    expect(all).not.toMatch(/@[a-z]+\./i);
  });
});
