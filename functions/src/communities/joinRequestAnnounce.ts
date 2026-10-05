import { db, FieldValue, Timestamp } from '../lifecycle/helpers';
import { userLang } from '../notifications/userLang';
import {
  JOIN_REQUEST_NOTIFICATION_TYPE,
  joinRequestNotice,
  joinRequestNotificationId,
  joinRequestNoticePath,
  shouldNotify,
} from './joinRequestNotice';

/**
 * Tell a community's owner that someone asked to join. Called by onCommunityInviteJoinRequest
 * for every request that newly becomes pending. Lives in its own file (not invites.ts) so it
 * can be run directly by a test, and so index.ts does not export it as if it were a function.
 *
 * Returns whether a notification was written.
 */
export async function announceJoinRequest(p: {
  chatId: string;
  requesterUid: string;
  requesterName: unknown;
  /** The trigger event's id: the same for every redelivery of one event. */
  eventId: string;
  /** Injectable clock, for tests. */
  nowMs?: number;
}): Promise<boolean> {
  const chat = await db.collection('chats').doc(p.chatId).get();
  const ownerId = chat.get('ownerId');
  if (typeof ownerId !== 'string' || !ownerId || ownerId === p.requesterUid) return false;

  const { title, message } = joinRequestNotice(await userLang(ownerId), {
    communityName: chat.get('name'),
    requesterName: p.requesterName,
  });

  // ONE transaction does three jobs. (1) The cooldown: this requester has already caused a push
  // to this community within the window (they cancelled and asked again), so say nothing.
  // The stamp lives in a server-only doc because the request doc is deleted on cancel.
  // (2) Idempotence against at-least-once delivery: a redelivered copy of this event finds
  // its notification already there and stops, and even a late one finds the stamp. (3) The
  // stamp and the notification are written together or not at all, so a crash between them
  // can neither lose the push nor double it.
  const stampRef = db.doc(joinRequestNoticePath(p.chatId, p.requesterUid));
  const notificationRef = db.collection('notifications').doc(joinRequestNotificationId(p.eventId));
  return db.runTransaction(async (tx) => {
    const [stamp, already] = await Promise.all([tx.get(stampRef), tx.get(notificationRef)]);
    if (already.exists) return false;
    const last = stamp.get('lastNotifiedAt') as { toMillis?: () => number } | undefined;
    const now = p.nowMs ?? Date.now();
    if (!shouldNotify(last?.toMillis?.(), now)) return false;
    tx.set(stampRef, { lastNotifiedAt: Timestamp.fromMillis(now) });
    tx.create(notificationRef, {
      userId: ownerId,
      title,
      message,
      data: { type: JOIN_REQUEST_NOTIFICATION_TYPE, chatId: p.chatId },
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}
