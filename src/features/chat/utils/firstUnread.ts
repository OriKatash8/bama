/**
 * The message a chat should open on: the oldest of the last `count` messages
 * from other people, `count` being the reader's unread count when they opened
 * the chat (read BEFORE it is cleared). The reader's own messages never count.
 *
 * Messages carry no per-reader receipt (readBy is written once, at send), so
 * the count is the only record of what is new. Fewer loaded messages than the
 * count: the oldest loaded one from others. Nothing to point at: null.
 */
export function firstUnreadMessageId(
  messages: { id: string; senderId?: string }[],
  me: string,
  count: number,
): string | null {
  if (count <= 0) return null;
  let seen = 0;
  let oldest: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.senderId === me) continue;
    oldest = msg.id;
    seen += 1;
    if (seen === count) return msg.id;
  }
  return oldest;
}
