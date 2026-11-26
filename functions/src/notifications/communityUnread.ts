import { FieldValue } from 'firebase-admin/firestore';

/**
 * The unread update for a new community message: +1 for every member but the
 * sender, in `channelUnread.<uid>.<channelId>` on the community's chat doc.
 * The reader clears their own entry on viewing that channel (ChatRoomScreen).
 *
 * There is deliberately NO community-wide `unreadCount` any more. It was a second
 * number that had to be kept in step with the per-channel ones and was only ever
 * reset on open, so it drifted. The badge on the community's icon is derived on
 * the client as the sum of the reader's `channelUnread` entries (communityUnread
 * in src/features/chat/utils), and the per-channel count is also what places the
 * "N new messages" divider.
 *
 * Counted for muted members too: mute silences notifications, it does not
 * pretend nothing was said.
 */
export function communityUnreadUpdate(
  members: string[],
  senderId: string,
  channelId: string,
): Record<string, FieldValue> {
  const update: Record<string, FieldValue> = {};
  for (const uid of new Set(members)) {
    if (uid === senderId) continue;
    update[`channelUnread.${uid}.${channelId}`] = FieldValue.increment(1);
  }
  return update;
}
