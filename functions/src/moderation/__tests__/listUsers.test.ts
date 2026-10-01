/**
 * adminListUsers: every account for the admin Users page — name (from the user
 * doc) and email (from Auth, never the doc), sorted by name. Admins only.
 */

type Rec = { uid: string; email?: string; disabled: boolean; metadata: { creationTime: string } };
const mockPages: { users: Rec[]; pageToken?: string }[] = [];
const mockDocs = new Map<string, Record<string, unknown>>();

jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  auth: () => ({ listUsers: jest.fn(async () => mockPages.shift() ?? { users: [] }) }),
}));
jest.mock('../../lifecycle/helpers', () => {
  const { HttpsError } = jest.requireActual('firebase-functions/v2/https');
  return {
    requireAuth: (uid?: string) => { if (!uid) throw new HttpsError('unauthenticated', 'x'); },
    requireAdmin: (t?: { role?: string }) => { if (t?.role !== 'admin') throw new HttpsError('permission-denied', 'x'); },
    db: {
      doc: (path: string) => ({ path }),
      getAll: async (...refs: { path: string }[]) =>
        refs.map((r) => ({ id: r.path.split('/')[1], data: () => mockDocs.get(r.path) })),
    },
  };
});

import { adminListUsers } from '../lookup';

const call = (token: Record<string, unknown> | undefined, uid: string | null = 'admin1') =>
  (adminListUsers as unknown as { run: (r: unknown) => Promise<{ users: unknown[]; truncated: boolean }> })
    .run({ auth: uid ? { uid, token } : undefined, data: {} });

const rec = (uid: string, email?: string, disabled = false): Rec =>
  ({ uid, email, disabled, metadata: { creationTime: 'Tue, 01 Sep 2026 10:00:00 GMT' } });

beforeEach(() => { mockPages.length = 0; mockDocs.clear(); });

it('lists every account with its name and its Auth email, sorted by name', async () => {
  mockPages.push({ users: [rec('u1', 'noa@x.com'), rec('u2', 'avi@y.com', true)], pageToken: 'next' });
  mockPages.push({ users: [rec('u3', undefined)] });
  mockDocs.set('users/u1', { displayName: 'Noa', email: 'stale@doc.com' });
  mockDocs.set('users/u2', { displayName: 'Avi' });
  mockDocs.set('users/u3', { displayName: '' });

  const { users, truncated } = await call({ role: 'admin' });
  expect(truncated).toBe(false);
  expect(users).toEqual([
    { uid: 'u3', displayName: '', email: null, disabled: false, createdAt: Date.parse('Tue, 01 Sep 2026 10:00:00 GMT') },
    { uid: 'u2', displayName: 'Avi', email: 'avi@y.com', disabled: true, createdAt: expect.any(Number) },
    { uid: 'u1', displayName: 'Noa', email: 'noa@x.com', disabled: false, createdAt: expect.any(Number) },
  ]);
});

it('an account with no user document still lists, by its email', async () => {
  mockPages.push({ users: [rec('u9', 'ghost@z.com')] });
  const { users } = await call({ role: 'admin' });
  expect(users).toEqual([expect.objectContaining({ uid: 'u9', displayName: '', email: 'ghost@z.com' })]);
});

it('is for admins only', async () => {
  await expect(call({ role: 'user' })).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(call(undefined, null)).rejects.toMatchObject({ code: 'unauthenticated' });
});
