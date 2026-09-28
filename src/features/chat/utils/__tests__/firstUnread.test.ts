import { firstUnreadMessageId } from '../firstUnread';

/**
 * Where a chat opens: the oldest of the last N messages from other people,
 * N being the reader's unread count at the moment they opened it. Their own
 * messages never count as unread.
 */
const m = (id: string, senderId: string) => ({ id, senderId }) as never;
const ME = 'me';

it('counts back N messages from others, skipping my own', () => {
  const msgs = [m('1', 'a'), m('2', ME), m('3', 'a'), m('4', 'b'), m('5', ME), m('6', 'a')];
  expect(firstUnreadMessageId(msgs, ME, 1)).toBe('6');
  expect(firstUnreadMessageId(msgs, ME, 2)).toBe('4');
  expect(firstUnreadMessageId(msgs, ME, 3)).toBe('3');
});

it('system messages from others count, like the server counted them', () => {
  expect(firstUnreadMessageId([m('1', 'a'), m('2', 'system')], ME, 1)).toBe('2');
});

it('more unread than loaded: the oldest loaded message from others', () => {
  expect(firstUnreadMessageId([m('1', ME), m('2', 'a'), m('3', 'b')], ME, 10)).toBe('2');
});

it('nothing unread, or nothing from others: no target', () => {
  expect(firstUnreadMessageId([m('1', 'a')], ME, 0)).toBeNull();
  expect(firstUnreadMessageId([m('1', ME)], ME, 3)).toBeNull();
  expect(firstUnreadMessageId([], ME, 3)).toBeNull();
});
