/**
 * onProjectClosed, run for real against an in-memory Firestore: posts one
 * closing message with the team's phones, bumps every member's unread count,
 * and a second run (a retry, or a project that reopened) posts nothing more.
 * On a completed project a member with no phone gets their (verified, non-relay)
 * email from Auth instead; a cancelled project never looks one up.
 */

import { onProjectClosed } from '../closingTrigger';

type Doc = Record<string, unknown>;
const mockStore = new Map<string, Doc>();
const mockUpdates: { path: string; data: Doc }[] = [];

jest.mock('../helpers', () => {
  const ref = (path: string) => ({
    get: async () => ({ data: () => mockStore.get(path) }),
    create: async (data: Doc) => {
      if (mockStore.has(path)) throw Object.assign(new Error('exists'), { code: 6 });
      mockStore.set(path, data);
    },
    update: async (data: Doc) => { mockUpdates.push({ path, data }); },
  });
  return {
    db: { doc: ref, collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }) },
    FieldValue: { serverTimestamp: () => 'TS', increment: (n: number) => ({ inc: n }) },
  };
});

const mockAuthUsers = new Map<string, { email?: string; emailVerified?: boolean }>();
const mockGetUser = jest.fn(async (uid: string) => {
  const u = mockAuthUsers.get(uid);
  if (!u) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
  return u;
});
jest.mock('firebase-admin', () => ({ auth: () => ({ getUser: (uid: string) => mockGetUser(uid) }) }));

const project = (status: string) => ({
  status, chatId: 'chat1', clientId: 'client',
  filledSlots: [{ professionalId: 'p1', category: 'Editor' }],
});
const event = (before: string, after: string) =>
  ({ data: { before: { data: () => project(before) }, after: { data: () => project(after) } }, params: { projectId: 'x' } });
const run = (before: string, after: string) =>
  (onProjectClosed as unknown as { run: (e: unknown) => Promise<void> }).run(event(before, after));

beforeEach(() => {
  mockStore.clear();
  mockUpdates.length = 0;
  mockAuthUsers.clear();
  mockGetUser.mockClear();
  mockAuthUsers.set('client', { email: 'dana@example.com', emailVerified: true });
  mockAuthUsers.set('p1', { email: 'avi@example.com', emailVerified: true });
  mockStore.set('users/client', { displayName: 'Dana' });
  mockStore.set('users/p1', { displayName: 'Avi' });
  mockStore.set('users/client/private/contact', { phone: '+972501234567' });
  mockStore.set('chats/chat1', { members: ['client', 'p1'] });
});

it('posts the team list once, with phones, and bumps everyone\'s unread', async () => {
  await run('in_progress', 'completed');

  const msg = mockStore.get('chats/chat1/messages/project-closed') as Doc & { team: { name: string; phone: string | null; email: string | null }[] };
  expect(msg.kind).toBe('project_closed');
  expect(msg.system).toBe(true);
  // Dana has a phone: phone only. Avi has none: his email instead.
  expect(msg.team.map((m) => [m.name, m.phone, m.email])).toEqual([['Dana', '+972501234567', null], ['Avi', null, 'avi@example.com']]);
  // Only the member with no phone is looked up.
  expect(mockGetUser.mock.calls.map((c) => c[0])).toEqual(['p1']);
  expect(msg.contactEmail).toBe('bama.app.hk@gmail.com');

  expect(mockUpdates).toHaveLength(1);
  expect(mockUpdates[0].data['unreadCount.client']).toEqual({ inc: 1 });
  expect(mockUpdates[0].data['unreadCount.p1']).toEqual({ inc: 1 });
});

it('a second closing never posts again or bumps unread again', async () => {
  await run('in_progress', 'completed');
  await run('open', 'completed'); // reopened and completed again
  expect(mockUpdates).toHaveLength(1);
});

it('also posts when the project is cancelled — phones only, no email looked up', async () => {
  await run('open', 'cancelled');
  const msg = mockStore.get('chats/chat1/messages/project-closed') as Doc & { team: { phone: string | null; email: string | null }[] };
  expect(msg.closedAs).toBe('cancelled');
  expect(msg.team.map((m) => [m.phone, m.email])).toEqual([['+972501234567', null], [null, null]]);
  expect(mockGetUser).not.toHaveBeenCalled();
});

it.each([
  ['unverified', { email: 'avi@example.com', emailVerified: false }],
  ['an Apple private relay', { email: 'x1@PrivateRelay.AppleID.com', emailVerified: true }],
  ['missing', { emailVerified: true }],
])('an email that is %s is never shown: the dash stays', async (_label, authUser) => {
  mockAuthUsers.set('p1', authUser);
  await run('in_progress', 'completed');
  const msg = mockStore.get('chats/chat1/messages/project-closed') as Doc & { team: { email: string | null }[]; text: string };
  expect(msg.team[1].email).toBeNull();
  expect(msg.text).toContain('Avi — Editor — —');
});

it('an Auth lookup that fails still posts the list, with the dash', async () => {
  mockAuthUsers.delete('p1');
  await run('in_progress', 'completed');
  const msg = mockStore.get('chats/chat1/messages/project-closed') as Doc & { team: { email: string | null }[] };
  expect(msg.team[1].email).toBeNull();
});

it('does nothing on any other update', async () => {
  await run('open', 'in_progress');
  await run('completed', 'completed');
  expect(mockStore.has('chats/chat1/messages/project-closed')).toBe(false);
  expect(mockUpdates).toHaveLength(0);
});
