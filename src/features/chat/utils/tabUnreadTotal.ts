import type { Chat } from '@features/chat/types';

/**
 * The Chats tab badge: the user's unread across the chats IN the Chats list.
 * Communities are left out — the list does not show them (they have their own
 * strip, with a badge per community), so counting them here would put a
 * number on the tab with no row to explain it.
 */
export function tabUnreadTotal(chats: Pick<Chat, 'type' | 'unreadCount'>[], userId: string): number {
  return chats.reduce(
    (acc, c) => (c.type === 'community' ? acc : acc + (c.unreadCount?.[userId] ?? 0)),
    0,
  );
}
