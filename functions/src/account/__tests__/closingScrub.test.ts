/**
 * Account deletion scrubs the user out of every project-closing card: their
 * name becomes the tombstone name, phone and email go, the plain text is
 * regenerated — and nothing else in the message, or about anyone else, changes.
 * Run for real against an in-memory Firestore.
 */

import { scrubClosingCards } from '../closingScrub';
import { buildClosingNotice } from '../../lifecycle/closingNotice';

type Doc = Record<string, unknown>;
const mockStore = new Map<string, Doc>();
const mockFailOn = new Set<string>();

jest.mock('../../lifecycle/helpers', () => {
  const ref = (path: string) => ({ path, get: async () => ({ data: () => mockStore.get(path) }) });
  const where = (field: string, op: string, value: unknown) => ({
    get: async () => ({
      docs: [...mockStore.entries()]
        .filter(([p]) => /^projects\/[^/]+$/.test(p))
        .filter(([, d]) => (op === '==' ? d[field] === value : ((d[field] as unknown[]) ?? []).includes(value)))
        .map(([, d]) => ({ data: () => d })),
    }),
  });
  return {
    db: {
      doc: ref,
      collection: () => ({ where }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          get: async (r: { path: string }) => {
            if (mockFailOn.has(r.path)) throw new Error('boom');
            return { data: () => mockStore.get(r.path) };
          },
          update: (r: { path: string }, data: Doc) => { mockStore.set(r.path, { ...mockStore.get(r.path), ...data }); },
        };
        return fn(tx);
      },
    },
  };
});

const TOMB = 'חשבון שנמחק';
const closing = (chatId: string) => `chats/${chatId}/messages/project-closed`;

function card(status: 'completed' | 'cancelled', clientId: string, pros: string[]) {
  const people: Record<string, { name: string }> = { client: { name: 'Dana' }, pro: { name: 'Avi' }, other: { name: 'Noa' } };
  return {
    senderId: 'system', system: true, timestamp: 'TS', readBy: ['x'],
    ...buildClosingNotice({
      status, clientId,
      filledSlots: pros.map((p) => ({ professionalId: p, category: 'Editor' })),
      people,
      phones: { client: null, pro: '+972501234567', other: '+972541112222' },
      emails: { client: 'dana@example.com' },
    }),
  };
}

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  mockStore.clear();
  mockFailOn.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it('as the client: scrubs their entry and regenerates the text; everyone and everything else stays', async () => {
  mockStore.set('projects/p1', { clientId: 'client', professionalIds: ['pro', 'other'], chatId: 'c1' });
  const before = card('completed', 'client', ['pro', 'other']);
  mockStore.set(closing('c1'), before);

  const res = await scrubClosingCards('client', TOMB);

  const after = mockStore.get(closing('c1')) as typeof before;
  expect(res).toEqual({ scrubbed: 1, failed: 0 });
  expect(after.team[0]).toEqual({ ...before.team[0], name: TOMB, phone: null, email: null });
  expect(after.team.slice(1)).toEqual(before.team.slice(1));
  expect(after.text).not.toContain('Dana');
  expect(after.text).not.toContain('dana@example.com');
  expect(after.text).toContain(`• ${TOMB} — לקוח — —`);
  expect(after.text).toContain('Avi — Editor — 050-123-4567');
  for (const k of ['senderId', 'system', 'timestamp', 'readBy', 'kind', 'closedAs', 'contactEmail']) {
    expect((after as Doc)[k]).toEqual((before as Doc)[k]);
  }
});

it('as a professional, including a chat they have since left (found through the project, not the chat)', async () => {
  mockStore.set('projects/p1', { clientId: 'client', professionalIds: ['pro'], chatId: 'c1' });
  mockStore.set('chats/c1', { members: ['client'] }); // left the chat
  mockStore.set(closing('c1'), card('cancelled', 'client', ['pro']));

  await scrubClosingCards('pro', TOMB);

  const after = mockStore.get(closing('c1')) as ReturnType<typeof card>;
  expect(after.team[1]).toMatchObject({ uid: 'pro', name: TOMB, phone: null, email: null, roles: ['Editor'] });
  expect(after.text).toContain(`• ${TOMB} — Editor — —`);
  expect(after.text).toContain('🏁 הפרויקט בוטל');
});

it('skips a project with no chat, a chat with no closing card, and a card that does not list them', async () => {
  mockStore.set('projects/p1', { clientId: 'client', professionalIds: [] });
  mockStore.set('projects/p2', { clientId: 'client', professionalIds: [], chatId: 'c2' });
  mockStore.set('projects/p3', { clientId: 'x', professionalIds: ['client'], chatId: 'c3' });
  const other = card('completed', 'x', ['pro']);
  mockStore.set(closing('c3'), other);

  const res = await scrubClosingCards('client', TOMB);

  expect(res).toEqual({ scrubbed: 0, failed: 0 });
  expect(mockStore.get(closing('c3'))).toEqual(other);
});

it('scrubs a card written before the email field existed', async () => {
  mockStore.set('projects/p1', { clientId: 'client', professionalIds: [], chatId: 'c1' });
  mockStore.set(closing('c1'), {
    kind: 'project_closed', closedAs: 'completed', contactEmail: 'bama.app.hk@gmail.com', text: 'old',
    team: [{ uid: 'client', name: 'Dana', isClient: true, roles: [], phone: '+972501234567' }],
  });
  await scrubClosingCards('client', TOMB);
  const after = mockStore.get(closing('c1')) as { team: Doc[]; text: string };
  expect(after.team[0]).toMatchObject({ name: TOMB, phone: null, email: null });
  expect(after.text).not.toContain('050-123-4567');
});

it('is safe to run again', async () => {
  mockStore.set('projects/p1', { clientId: 'client', professionalIds: [], chatId: 'c1' });
  mockStore.set(closing('c1'), card('completed', 'client', ['pro']));
  await scrubClosingCards('client', TOMB);
  const once = mockStore.get(closing('c1'));
  await scrubClosingCards('client', TOMB);
  expect(mockStore.get(closing('c1'))).toEqual(once);
});

it('one failing message is logged with the uid and chatId, and the rest still run', async () => {
  mockStore.set('projects/p1', { clientId: 'client', professionalIds: [], chatId: 'bad' });
  mockStore.set('projects/p2', { clientId: 'client', professionalIds: [], chatId: 'good' });
  mockStore.set(closing('bad'), card('completed', 'client', ['pro']));
  mockStore.set(closing('good'), card('completed', 'client', ['pro']));
  mockFailOn.add(closing('bad'));

  const res = await scrubClosingCards('client', TOMB);

  expect(res).toEqual({ scrubbed: 1, failed: 1 });
  expect((mockStore.get(closing('good')) as ReturnType<typeof card>).team[0].name).toBe(TOMB);
  expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('FAILED'), expect.objectContaining({ uid: 'client', chatId: 'bad' }));
});
