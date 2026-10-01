import { communityUnreadUpdate } from '../communityUnread';

/**
 * A new community message counts as unread for every member but its sender —
 * what lights the badge on the community's icon in "My communities".
 */
const inc = (n: unknown) => (n as { operand?: number }).operand ?? n;

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ operand: n }) },
}));

it('adds one for every member except the sender', () => {
  const u = communityUnreadUpdate(['a', 'b', 'c'], 'b', 'ch1');
  expect(Object.keys(u).filter((k) => k.startsWith('unreadCount.')).sort()).toEqual(['unreadCount.a', 'unreadCount.c']);
  expect(inc(u['unreadCount.a'])).toBe(1);
  expect(inc(u['unreadCount.c'])).toBe(1);
});

it('also counts the message against its channel, per member', () => {
  // What places the "N new messages" divider inside that one channel.
  const u = communityUnreadUpdate(['a', 'b', 'c'], 'b', 'ch1');
  expect(Object.keys(u).filter((k) => k.startsWith('channelUnread.')).sort())
    .toEqual(['channelUnread.a.ch1', 'channelUnread.c.ch1']);
  expect(inc(u['channelUnread.a.ch1'])).toBe(1);
});

it('a message in an empty or one-person community counts for nobody', () => {
  expect(communityUnreadUpdate([], 'a', 'ch1')).toEqual({});
  expect(communityUnreadUpdate(['a'], 'a', 'ch1')).toEqual({});
});

it('ignores duplicate member ids', () => {
  expect(Object.keys(communityUnreadUpdate(['a', 'a', 'b'], 'b', 'ch1'))).toEqual(['unreadCount.a', 'channelUnread.a.ch1']);
});

it('onNewCommunityMessage writes that update to the community doc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path');
  const src: string = readFileSync(join(__dirname, '..', 'triggers.ts'), 'utf8');
  const trigger = src.slice(src.indexOf('export const onNewCommunityMessage'), src.indexOf('export const onNewPriceOffer'));
  expect(trigger).toMatch(/communityUnreadUpdate\(members, message\.senderId, channelId\)/);
  expect(trigger).toMatch(/chatDoc\.ref\.update\(unread\)/);
});
