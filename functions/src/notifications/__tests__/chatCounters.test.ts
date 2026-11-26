import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chatMessageUpdate, previewText, PREVIEW_MAX } from '../chatCounters';

/**
 * lastMessage and the recipients' unread count for dm / group / purchase chats
 * are written by the server (onNewChatMessageCounters), not the sender's client.
 */
const inc = (n: unknown) => (n as { operand?: number }).operand ?? n;

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ operand: n }), serverTimestamp: () => 'SERVER_TS' },
}));

it('adds one for every member except the sender', () => {
  const u = chatMessageUpdate(['a', 'b', 'c'], 'b', 'hi', 'TS');
  expect(Object.keys(u).filter((k) => k.startsWith('unreadCount.')).sort()).toEqual(['unreadCount.a', 'unreadCount.c']);
  expect(inc(u['unreadCount.a'])).toBe(1);
});

it('never counts the sender against themselves', () => {
  expect(Object.keys(chatMessageUpdate(['a'], 'a', 'hi', 'TS'))).toEqual(['lastMessage']);
});

it('previews with the message text, sender and timestamp, as the client used to', () => {
  expect(chatMessageUpdate(['a', 'b'], 'b', 'hello', 'TS').lastMessage).toEqual({ text: 'hello', senderId: 'b', timestamp: 'TS' });
  // A photo or voice note has no text: the preview stays '' and the list renders it.
  expect((chatMessageUpdate(['a', 'b'], 'b', '', 'TS').lastMessage as { text: string }).text).toBe('');
});

it('ignores duplicate member ids', () => {
  expect(Object.keys(chatMessageUpdate(['a', 'a', 'b'], 'b', 'x', 'TS'))).toEqual(['lastMessage', 'unreadCount.a']);
});

describe('previewText (the sender wrote the field; the rules do not pin it)', () => {
  it('passes a normal string through', () => expect(previewText('hello')).toBe('hello'));
  it('turns a non-string into an empty preview', () => {
    for (const bad of [undefined, null, 5, { a: 1 }, ['x']]) expect(previewText(bad)).toBe('');
  });
  it('caps the length', () => expect(previewText('x'.repeat(PREVIEW_MAX + 900))).toHaveLength(PREVIEW_MAX));
});

describe('onNewChatMessageCounters', () => {
  const src = readFileSync(join(__dirname, '..', 'triggers.ts'), 'utf8');
  const trigger = src.slice(src.indexOf('export const onNewChatMessageCounters'), src.indexOf('export const onNewCommunityMessage'));

  it('skips system messages — their writers bump unread themselves, so counting here would double it', () => {
    expect(trigger).toMatch(/message\.system \|\| message\.senderId === 'system' \|\| message\.senderId === SYSTEM_USER_ID\) return/);
  });

  it('does not touch communities', () => {
    expect(trigger).toMatch(/type === 'community'\) return/);
  });

  it('takes the preview time from the server (createTime), never the sender-written timestamp field', () => {
    expect(trigger).toMatch(/snap\.createTime/);
    expect(trigger).not.toMatch(/message\.timestamp/);
  });

  it('writes the update to the chat doc', () => {
    expect(trigger).toMatch(/chatRef\.update\(\s*chatMessageUpdate\(/);
  });
});

describe('server paths that post a system message still own their own counter (no double count)', () => {
  const files = [
    'lifecycle/candidates.ts', 'lifecycle/closingTrigger.ts', 'lifecycle/repricing.ts',
    'lifecycle/completion.ts', 'lifecycle/removal.ts', 'lifecycle/chatClose.ts',
  ];
  it.each(files)('%s posts as senderId "system", which the trigger skips', (f) => {
    const src = readFileSync(join(__dirname, '..', '..', f), 'utf8');
    expect(src).toMatch(/senderId: 'system'/);
  });
  it('the BAMA System DM posts as SYSTEM_USER_ID, which the trigger skips', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'system/index.ts'), 'utf8');
    expect(src).toMatch(/senderId: SYSTEM_USER_ID/);
  });
});
