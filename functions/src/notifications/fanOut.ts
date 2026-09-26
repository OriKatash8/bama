import * as admin from 'firebase-admin';
import { recipientsFor, type Recipient } from './recipients';

/** Newest-first, and how many of them a user doc keeps. */
export const MAX_PENDING_MENTIONS = 50;

export type MentionRef = {
  chatId: string;
  /** null for a group chat; the channel for a community, so a mention in one
   *  channel is not cleared by opening another in the same community. */
  channelId: string | null;
  /** Which message to jump to. */
  messageId: string;
  at: admin.firestore.FieldValue;
};

/**
 * Write one message's notifications, and the mention records behind the
 * chat-list @ pill, in a SINGLE batched commit.
 *
 * Replaces a `Promise.all` that did, per recipient, one `users/{uid}` read for
 * the mute check plus one individual `notifications.add()`. Two things fall out
 * of doing it here instead:
 *
 *  - **The mute read is skipped for mentioned users.** A mention overrides mute
 *    by definition, so reading the flag to then ignore it was pure waste. For
 *    `@everyone` that is *every* recipient, which is the difference between 200
 *    reads and none.
 *  - **The writes are batched.** 200 individual adds become one commit.
 *
 * What this does NOT change: `onNotificationCreate` still fires once per
 * notification document, each with its own `pushTokens` query and Expo call.
 * That is inherent to the notification-doc→push design and is the same cost an
 * ordinary community message has always had — `@everyone` does not introduce
 * it, it only removes the mute filter that used to shrink the audience.
 */
export async function fanOutMessage(
  db: admin.firestore.Firestore,
  args: {
    members: readonly string[];
    senderId: string;
    mentions?: readonly string[];
    mentionsEveryone?: boolean;
    /** Only consulted for recipients who were NOT mentioned. */
    mutedBy: readonly string[];
    title: string;
    /** Body for an ordinary message. */
    body: string;
    /** Body for someone who was mentioned — it has to say so. */
    mentionBody: string;
    data: Record<string, string>;
    /** Where the @ pill and jump-to-mention should point. */
    ref: { chatId: string; channelId: string | null; messageId: string };
  },
): Promise<Recipient[]> {
  const recipients = recipientsFor({
    members: args.members,
    senderId: args.senderId,
    mentions: args.mentions,
    mentionsEveryone: args.mentionsEveryone,
    mutedBy: args.mutedBy,
  });
  if (recipients.length === 0) return recipients;

  /**
   * Drop anyone who has BLOCKED the sender. Without this, blocking is cosmetic
   * in the way users notice first: their chat list hides the conversation, and
   * then a push notification arrives from the person they blocked.
   *
   * SIZE-CAPPED AT 10 ON PURPOSE. This costs one document read per recipient.
   * That is nothing for a DM (one read) or a project group, and unacceptable for
   * a 200-member community on every single message — the whole point of this
   * function's arrayUnion note above is that per-recipient reads are the cost to
   * avoid. Blocking exists for the harassment vector Apple 1.2 names, which is
   * direct contact; a community is a public broadcast, already mutable per chat,
   * and a blocked member's messages are hidden there by the client instead.
   *
   * getAll, not N gets: one round trip regardless of member count.
   */
  let delivered = recipients;
  if (recipients.length <= 10) {
    try {
      const refs = recipients.map((r) =>
        db.collection('users').doc(r.userId).collection('blocks').doc(args.senderId),
      );
      const snaps = await db.getAll(...refs);
      const blockedBy = new Set(
        snaps.map((snap, i) => (snap.exists ? recipients[i].userId : null)).filter(Boolean) as string[],
      );
      if (blockedBy.size > 0) {
        delivered = recipients.filter((r) => !blockedBy.has(r.userId));
        console.log('[fanOut] suppressed for blockers:', blockedBy.size);
      }
    } catch (e) {
      // Fail OPEN: a lookup failure must not silence legitimate notifications.
      // The client still hides blocked conversations, so the worst case is one
      // stray push rather than a chat nobody is told about.
      console.error('[fanOut] block lookup failed; delivering anyway', (e as Error)?.message);
    }
  }
  if (delivered.length === 0) return delivered;

  const batch = db.batch();
  const entry = {
    chatId: args.ref.chatId,
    channelId: args.ref.channelId,
    messageId: args.ref.messageId,
    at: admin.firestore.Timestamp.now(),
  };

  for (const r of delivered) {
    batch.set(db.collection('notifications').doc(), {
      userId: r.userId,
      title: args.title,
      message: r.kind === 'mention' ? args.mentionBody : args.body,
      // 'mention' is in the ESSENTIAL list, so notifPrefs cannot silence it —
      // the same reason it is allowed past mute.
      data: { ...args.data, type: r.kind },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (r.kind === 'mention') {
      // arrayUnion rather than read-modify-write: capping server-side would
      // cost one read per recipient, which is exactly the fan-out cost this
      // function exists to remove. The list is trimmed to
      // MAX_PENDING_MENTIONS by the client when it clears on open, which is
      // also the only moment anyone is looking at it.
      batch.set(
        db.collection('users').doc(r.userId),
        { pendingMentions: admin.firestore.FieldValue.arrayUnion(entry) },
        { merge: true },
      );
    }
  }

  await batch.commit();
  // `delivered`, not `recipients`: the return value is who was actually
  // notified, which is what a caller or test should be able to assert on.
  return delivered;
}

/**
 * Which recipients still need their mute checked.
 *
 * A mention overrides mute, so only the others do — and when `@everyone` is set
 * nobody does. The caller reads user documents for exactly this list.
 */
export function needMuteCheck(args: {
  members: readonly string[];
  senderId: string;
  mentions?: readonly string[];
  mentionsEveryone?: boolean;
}): string[] {
  if (args.mentionsEveryone) return [];
  const mentioned = new Set(args.mentions ?? []);
  return args.members.filter((uid) => uid !== args.senderId && !mentioned.has(uid));
}
