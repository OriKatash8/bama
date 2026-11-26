import type { Chat } from '@features/chat/types';

/**
 * A community's unread, for the badge on its icon: the sum of the reader's
 * per-channel counts (`channelUnread.<uid>.<channelId>`).
 *
 * Derived, not stored. There used to be a second, community-wide `unreadCount`
 * that the server bumped alongside the channel count and the client reset once, on
 * open — so it drifted from the per-channel numbers the divider is placed from.
 * One number now: reading a channel clears that channel, and the badge follows.
 */
export function communityUnread(chat: Pick<Chat, 'channelUnread'>, userId: string): number {
  const mine = chat.channelUnread?.[userId];
  if (!mine) return 0;
  let total = 0;
  for (const n of Object.values(mine)) {
    if (typeof n === 'number' && n > 0) total += n;
  }
  return total;
}
