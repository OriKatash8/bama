import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Chat unread counters and the lastMessage preview are server-owned. A member may
 * write ONLY their own entry of unreadCount / channelUnread (any value), and no
 * client may write lastMessage / lastMessageAt.
 *
 * Runs against the Firestore emulator: `npm run test:rules`.
 */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bama-rules',
    firestore: { rules: readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function seedChat(id: string, extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'chats', id), {
      type: 'group', name: 'g', members: ['alice', 'bob'], createdAt: new Date(), ...extra,
    });
  });
}
const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('unreadCount', () => {
  it('a member may reset their own entry', async () => {
    await seedChat('c1', { unreadCount: { alice: 3, bob: 1 } });
    await assertSucceeds(updateDoc(doc(as('alice'), 'chats', 'c1'), { 'unreadCount.alice': 0 }));
  });

  it('a member may write their own entry to any value', async () => {
    await seedChat('c1', { unreadCount: { alice: 0 } });
    await assertSucceeds(updateDoc(doc(as('alice'), 'chats', 'c1'), { 'unreadCount.alice': 7 }));
  });

  it('works on a chat that has no unreadCount map yet', async () => {
    await seedChat('c1');
    await assertSucceeds(updateDoc(doc(as('alice'), 'chats', 'c1'), { 'unreadCount.alice': 0 }));
  });

  it('denies writing another member\'s entry', async () => {
    await seedChat('c1', { unreadCount: { alice: 3, bob: 1 } });
    await assertFails(updateDoc(doc(as('alice'), 'chats', 'c1'), { 'unreadCount.bob': 0 }));
  });

  it('denies another member\'s entry on a chat with no map', async () => {
    await seedChat('c1');
    await assertFails(updateDoc(doc(as('alice'), 'chats', 'c1'), { 'unreadCount.bob': 5 }));
  });

  it('denies a write that carries my own entry AND someone else\'s', async () => {
    await seedChat('c1', { unreadCount: { alice: 3, bob: 1 } });
    await assertFails(updateDoc(doc(as('alice'), 'chats', 'c1'), { 'unreadCount.alice': 0, 'unreadCount.bob': 0 }));
  });

  it('control: re-writing another member\'s entry with its CURRENT value is a no-op, so it passes (proves the denials above come from the diff, not from a rules error)', async () => {
    await seedChat('c1', { unreadCount: { alice: 3, bob: 1 } });
    await assertSucceeds(updateDoc(doc(as('alice'), 'chats', 'c1'), { 'unreadCount.alice': 0, 'unreadCount.bob': 1 }));
  });

  it('denies a non-member', async () => {
    await seedChat('c1', { unreadCount: { alice: 3 } });
    await assertFails(updateDoc(doc(as('mallory'), 'chats', 'c1'), { 'unreadCount.mallory': 0 }));
  });
});

describe('channelUnread (communities)', () => {
  const community = { type: 'community', ownerId: 'alice', name: 'c', category: 'x', joinMode: 'open' };

  it('a member may clear their own channel', async () => {
    await seedChat('k1', { ...community, channelUnread: { bob: { general: 4 } } });
    await assertSucceeds(updateDoc(doc(as('bob'), 'chats', 'k1'), { 'channelUnread.bob.general': 0 }));
  });

  it('works when the doc has no channelUnread yet', async () => {
    await seedChat('k1', community);
    await assertSucceeds(updateDoc(doc(as('bob'), 'chats', 'k1'), { 'channelUnread.bob.general': 0 }));
  });

  it('denies another member\'s channel entry', async () => {
    await seedChat('k1', { ...community, channelUnread: { alice: { general: 2 }, bob: { general: 4 } } });
    await assertFails(updateDoc(doc(as('bob'), 'chats', 'k1'), { 'channelUnread.alice.general': 0 }));
  });
});

describe('lastMessage', () => {
  it('a client may not write lastMessage', async () => {
    await seedChat('c1');
    await assertFails(updateDoc(doc(as('alice'), 'chats', 'c1'), {
      lastMessage: { text: 'forged', senderId: 'bob', timestamp: serverTimestamp() },
    }));
  });

  it('a client may not write lastMessageAt', async () => {
    await seedChat('c1');
    await assertFails(updateDoc(doc(as('alice'), 'chats', 'c1'), { lastMessageAt: serverTimestamp() }));
  });

  it('the old sendMessage update (preview + increment on others) is denied', async () => {
    await seedChat('c1', { unreadCount: { alice: 0, bob: 0 } });
    await assertFails(updateDoc(doc(as('alice'), 'chats', 'c1'), {
      lastMessage: { text: 'hi', senderId: 'alice', timestamp: serverTimestamp() },
      'unreadCount.bob': 1,
    }));
  });
});
