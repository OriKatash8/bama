import { fanOutMessage, needMuteCheck } from '../fanOut';

/**
 * One batched commit per message, and the two fan-out wins.
 *
 * The old shape was a Promise.all doing, per recipient, a `users/{uid}` read
 * for the mute check plus an individual `notifications.add()`. At 200 members
 * that is 200 reads and 200 writes from one message.
 */

const batch = {
  set: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
};
const db = {
  batch: jest.fn(() => batch),
  collection: jest.fn((name: string) => ({
    doc: jest.fn((id?: string) => ({ path: `${name}/${id ?? 'auto'}` })),
  })),
};
/** The real Firestore type is far larger than the slice fanOutMessage touches. */
const asDb = db as unknown as Parameters<typeof fanOutMessage>[0];

const ALICE = 'u-alice';
const BOB = 'u-bob';
const CARA = 'u-cara';

const call = (over: Partial<Parameters<typeof fanOutMessage>[1]> = {}) =>
  fanOutMessage(asDb, {
    members: [ALICE, BOB, CARA],
    senderId: ALICE,
    mutedBy: [],
    title: 'Alice',
    body: 'hello',
    mentionBody: 'mentioned you: hello',
    data: { chatId: 'c1' },
    ref: { chatId: 'c1', channelId: null, messageId: 'm1' },
    ...over,
  });

/** Notification documents written, as `userId:type:message`. */
const notifs = () =>
  batch.set.mock.calls
    .filter((c) => String(c[0].path).startsWith('notifications/'))
    .map((c) => `${c[1].userId}:${c[1].data.type}:${c[1].message}`)
    .sort();

/** User documents that got a pendingMentions entry. */
const pending = () =>
  batch.set.mock.calls
    .filter((c) => String(c[0].path).startsWith('users/'))
    .map((c) => ({ path: c[0].path, entry: c[1].pendingMentions }));

beforeEach(() => jest.clearAllMocks());

describe('one commit', () => {
  it('writes every notification in a single batch', async () => {
    await call();
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(notifs()).toEqual([`${BOB}:message:hello`, `${CARA}:message:hello`]);
  });

  it('commits nothing at all when there is nobody to tell', async () => {
    await call({ members: [ALICE] });
    expect(batch.commit).not.toHaveBeenCalled();
  });

  it('stays one commit at 200 members', async () => {
    const many = Array.from({ length: 200 }, (_, i) => `u-${i}`);
    await call({ members: [ALICE, ...many], mentionsEveryone: true });
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    expect(notifs()).toHaveLength(200);
  });
});

describe('a mention', () => {
  it('gets the mention body and the mention type', async () => {
    await call({ mentions: [BOB] });
    expect(notifs()).toEqual([`${BOB}:mention:mentioned you: hello`, `${CARA}:message:hello`]);
  });

  it('reaches a muted user, and the muted bystander stays silent', async () => {
    await call({ mentions: [BOB], mutedBy: [BOB, CARA] });
    expect(notifs()).toEqual([`${BOB}:mention:mentioned you: hello`]);
  });

  it('records a pendingMentions entry keyed by chat AND channel', async () => {
    await call({ mentions: [BOB], ref: { chatId: 'c1', channelId: 'gear', messageId: 'm7' } });
    const rows = pending();
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe(`users/${BOB}`);
    // arrayUnion is opaque here; the entry it was handed is what matters.
    expect(JSON.stringify(rows[0].entry)).toContain('gear');
    expect(JSON.stringify(rows[0].entry)).toContain('m7');
  });

  it('records nothing pending for an ordinary recipient', async () => {
    await call({ mentions: [BOB] });
    expect(pending().map((p) => p.path)).toEqual([`users/${BOB}`]);
  });
});

describe('@everyone', () => {
  it('gives EVERY other member a pendingMentions entry, or the pill never shows', async () => {
    await call({ mentionsEveryone: true });
    expect(pending().map((p) => p.path).sort()).toEqual([`users/${BOB}`, `users/${CARA}`]);
    expect(notifs()).toEqual([
      `${BOB}:mention:mentioned you: hello`,
      `${CARA}:mention:mentioned you: hello`,
    ]);
  });

  it('overrides mute for all of them', async () => {
    await call({ mentionsEveryone: true, mutedBy: [BOB, CARA] });
    expect(notifs()).toHaveLength(2);
  });
});

describe('needMuteCheck — the read we no longer do', () => {
  const base = { members: [ALICE, BOB, CARA], senderId: ALICE };

  it('asks about everyone but the sender on an ordinary message', () => {
    expect(needMuteCheck(base).sort()).toEqual([BOB, CARA]);
  });

  it('skips the mentioned — their mute is overridden, so the read is waste', () => {
    expect(needMuteCheck({ ...base, mentions: [BOB] })).toEqual([CARA]);
  });

  it('asks about NOBODY when @everyone is set', () => {
    // 200 reads become zero. This is the whole of the first fan-out win.
    expect(needMuteCheck({ ...base, mentionsEveryone: true })).toEqual([]);
  });
});
