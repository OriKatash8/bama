/**
 * Closing a project's group chat: the 🏁 system message and the read-only flag,
 * in one batch. Shared by the client's confirmation and the end-date auto-close.
 */

import { addChatCloseWrites, closeProjectChatOnce } from '../chatClose';

type Doc = Record<string, unknown>;
const mockStore = new Map<string, Doc>();
const mockWrites: { op: string; path: string; data: Doc }[] = [];

jest.mock('../helpers', () => {
  let n = 0;
  const ref = (path: string) => ({ path, get: async () => ({ data: () => mockStore.get(path) }) });
  const batch = () => {
    const pending: typeof mockWrites = [];
    return {
      set: (r: { path: string }, data: Doc) => { pending.push({ op: 'set', path: r.path, data }); },
      update: (r: { path: string }, data: Doc) => { pending.push({ op: 'update', path: r.path, data }); },
      commit: async () => { mockWrites.push(...pending); },
    };
  };
  return {
    db: {
      doc: ref,
      collection: (c: string) => ({ doc: () => ref(`${c}/m${++n}`) }),
      batch,
    },
    FieldValue: { serverTimestamp: () => 'TS' },
  };
});

beforeEach(() => { mockStore.clear(); mockWrites.length = 0; });

it('adds the 🏁 message and marks the chat read-only as completed', async () => {
  const { db } = jest.requireMock('../helpers');
  const batch = db.batch();
  addChatCloseWrites(batch, 'chat1');
  await batch.commit();

  const msg = mockWrites.find((w) => w.op === 'set')!;
  expect(msg.path).toMatch(/^chats\/chat1\/messages\//);
  expect(msg.data).toMatchObject({ senderId: 'system', system: true, text: '🏁 הפרויקט הושלם' });

  const chat = mockWrites.find((w) => w.op === 'update')!;
  expect(chat.path).toBe('chats/chat1');
  expect(chat.data).toMatchObject({
    readOnly: true, readOnlyReason: 'completed', readOnlyAt: 'TS',
    lastMessage: { text: '🏁 הפרויקט הושלם', senderId: 'system', timestamp: 'TS' },
  });
});

it('closeProjectChatOnce closes an open chat', async () => {
  mockStore.set('chats/chat1', { readOnly: false });
  expect(await closeProjectChatOnce('chat1')).toBe(true);
  expect(mockWrites.filter((w) => w.op === 'update')).toHaveLength(1);
});

it('closeProjectChatOnce leaves an already read-only chat alone (no second 🏁)', async () => {
  mockStore.set('chats/chat1', { readOnly: true });
  expect(await closeProjectChatOnce('chat1')).toBe(false);
  expect(mockWrites).toHaveLength(0);
});

it('closeProjectChatOnce does nothing for a chat that does not exist', async () => {
  expect(await closeProjectChatOnce('gone')).toBe(false);
  expect(mockWrites).toHaveLength(0);
});
