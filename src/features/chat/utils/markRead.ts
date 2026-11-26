/**
 * When, and what, to write to say "I have read this chat".
 *
 * Unread is a counter the SERVER bumps for everyone but the sender, so the reader
 * only ever resets their own entry to 0. Driving the reset off that counter (not
 * off message arrival) is what makes it race-free: a message that lands while the
 * chat is open raises the reader's count, and the reset follows the count. A reset
 * fired on message arrival could land BEFORE the server's +1 and leave the badge on 1.
 */
export type MarkReadState = {
  /** The count at open has been captured (it places the "N new messages" divider) — clearing earlier would erase it. */
  ready: boolean;
  focused: boolean;
  foreground: boolean;
  /** The live count for what is on screen: the chat's, or the open channel's. */
  unread: number;
};

export function shouldMarkRead(s: MarkReadState): boolean {
  return s.ready && s.focused && s.foreground && s.unread > 0;
}

/** The dotted field to reset: my entry in the chat's counter, or in the open channel's. */
export function unreadFieldPath(chatType: string | null, userId: string, channelId: string | null): string | null {
  if (chatType === 'community') return channelId ? `channelUnread.${userId}.${channelId}` : null;
  return chatType ? `unreadCount.${userId}` : null;
}
