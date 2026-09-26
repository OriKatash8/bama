/**
 * onProjectClosed, run for real against an in-memory Firestore: posts one
 * closing message with the team's phones, bumps every member's unread count,
 * and a second run (a retry, or a project that reopened) posts nothing more.
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
  mockStore.set('users/client', { displayName: 'Dana' });
  mockStore.set('users/p1', { displayName: 'Avi' });
  mockStore.set('users/client/private/contact', { phone: '+972501234567' });
  mockStore.set('chats/chat1', { members: ['client', 'p1'] });
});

it('posts the team list once, with phones, and bumps everyone\'s unread', async () => {
  await run('in_progress', 'completed');

  const msg = mockStore.get('chats/chat1/messages/project-closed') as Doc & { team: { name: string; phone: string | null }[] };
  expect(msg.kind).toBe('project_closed');
  expect(msg.system).toBe(true);
  expect(msg.team.map((m) => [m.name, m.phone])).toEqual([['Dana', '+972501234567'], ['Avi', null]]);
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

it('also posts when the project is cancelled', async () => {
  await run('open', 'cancelled');
  expect((mockStore.get('chats/chat1/messages/project-closed') as Doc).closedAs).toBe('cancelled');
});

it('does nothing on any other update', async () => {
  await run('open', 'in_progress');
  await run('completed', 'completed');
  expect(mockStore.has('chats/chat1/messages/project-closed')).toBe(false);
  expect(mockUpdates).toHaveLength(0);
});
