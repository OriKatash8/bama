import { tabUnreadTotal } from '../tabUnreadTotal';

/**
 * The Chats tab badge sums the unread counts of the chats IN the Chats list.
 * Communities are not in that list (they have their own strip with their own
 * badge), so their counts stay out of the tab's number.
 */
const chat = (type: string, unread: Record<string, number>) => ({ type, unreadCount: unread }) as never;

it('sums the user\'s unread across direct and group chats', () => {
  expect(tabUnreadTotal([chat('direct', { u: 2 }), chat('group', { u: 3, x: 9 })], 'u')).toBe(5);
});

it('leaves community messages out', () => {
  expect(tabUnreadTotal([chat('direct', { u: 1 }), chat('community', { u: 40 })], 'u')).toBe(1);
});

it('no counts, no number', () => {
  expect(tabUnreadTotal([chat('direct', {}), { type: 'group' } as never], 'u')).toBe(0);
});
