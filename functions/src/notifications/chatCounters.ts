import { FieldValue } from 'firebase-admin/firestore';

/**
 * The chat-doc update for a new message in a dm / group / purchase chat: the
 * `lastMessage` preview, and +1 unread for every member but the sender.
 *
 * This used to be written by the sender's client (chatService.sendMessage) as a
 * second, separate write after the message. That cost three things: a crash or a
 * dropped connection between the two writes left recipients with no badge and a
 * stale preview; the rules had to let any member write ANY member's counter; and
 * the sender's own exclusion was enforced only by their own client. The server
 * owns it now, the same way it owns community counts (communityUnread.ts).
 *
 * The preview is exactly what the client wrote: the message's own `text`, so a
 * photo or voice note with no caption previews as '' and the chat list's
 * `previewFor` renders it as before.
 *
 * System messages never come through here — the lifecycle/system writers that
 * post them bump their own counters in the same write (see chatCounterTrigger).
 */
export function chatMessageUpdate(
  members: string[],
  senderId: string,
  text: string,
  timestamp: unknown,
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    lastMessage: { text, senderId, timestamp },
  };
  for (const uid of new Set(members)) {
    if (uid === senderId) continue;
    update[`unreadCount.${uid}`] = FieldValue.increment(1);
  }
  return update;
}
