import { FieldValue } from 'firebase-admin/firestore';

/**
 * The unreadCount update for a new community message: +1 for every member but
 * the sender, as dotted paths on the community's chat doc. That count is what
 * lights the badge on the community's icon in "My communities", and opening
 * the community resets the reader's own entry to 0 (ChatRoomScreen).
 *
 * The same message is also counted against its channel, in
 * `channelUnread.<uid>.<channelId>`: the community-wide count spans every
 * channel, so it cannot say where in ONE channel the unread messages start.
 * The per-channel count can — it places the "N new messages" divider there,
 * and the reader clears their own entry on viewing that channel.
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
    update[`unreadCount.${uid}`] = FieldValue.increment(1);
    update[`channelUnread.${uid}.${channelId}`] = FieldValue.increment(1);
  }
  return update;
}
