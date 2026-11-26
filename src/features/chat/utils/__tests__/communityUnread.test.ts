import { communityUnread } from '../communityUnread';

it('sums my per-channel counts', () => {
  expect(communityUnread({ channelUnread: { me: { general: 2, news: 3 }, other: { general: 9 } } }, 'me')).toBe(5);
});
it('is 0 with no map, no entry for me, or only cleared channels', () => {
  expect(communityUnread({}, 'me')).toBe(0);
  expect(communityUnread({ channelUnread: { other: { general: 4 } } }, 'me')).toBe(0);
  expect(communityUnread({ channelUnread: { me: { general: 0 } } }, 'me')).toBe(0);
});
it('ignores junk and negative values instead of showing a wrong badge', () => {
  expect(communityUnread({ channelUnread: { me: { a: -3, b: 2 } as unknown as Record<string, number> } }, 'me')).toBe(2);
});
it('clearing one channel lowers the badge by exactly that channel', () => {
  const before = communityUnread({ channelUnread: { me: { a: 2, b: 3 } } }, 'me');
  const after = communityUnread({ channelUnread: { me: { a: 0, b: 3 } } }, 'me');
  expect(before - after).toBe(2);
});
