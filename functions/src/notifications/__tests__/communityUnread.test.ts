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
  const u = communityUnreadUpdate(['a', 'b', 'c'], 'b');
  expect(Object.keys(u).sort()).toEqual(['unreadCount.a', 'unreadCount.c']);
  expect(inc(u['unreadCount.a'])).toBe(1);
  expect(inc(u['unreadCount.c'])).toBe(1);
});

it('a message in an empty or one-person community counts for nobody', () => {
  expect(communityUnreadUpdate([], 'a')).toEqual({});
  expect(communityUnreadUpdate(['a'], 'a')).toEqual({});
});

it('ignores duplicate member ids', () => {
  expect(Object.keys(communityUnreadUpdate(['a', 'a', 'b'], 'b'))).toEqual(['unreadCount.a']);
});

it('onNewCommunityMessage writes that update to the community doc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path');
  const src: string = readFileSync(join(__dirname, '..', 'triggers.ts'), 'utf8');
  const trigger = src.slice(src.indexOf('export const onNewCommunityMessage'), src.indexOf('export const onNewPriceOffer'));
  expect(trigger).toMatch(/communityUnreadUpdate\(members, message\.senderId\)/);
  expect(trigger).toMatch(/chatDoc\.ref\.update\(unread\)/);
});
