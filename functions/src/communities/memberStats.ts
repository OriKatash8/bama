import type * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * One more message from `senderId` in community `chatId`, for the owner
 * dashboard's activity bars (`chats/{chatId}/memberStats/{uid}`).
 *
 * Best-effort: triggers are at-least-once, so a retried delivery can count a
 * message twice. Good enough for a relative activity bar; not a ledger.
 * Never throws — a failed count must not cost anyone their notification.
 */
export async function bumpMemberStats(
  db: admin.firestore.Firestore,
  chatId: string,
  senderId: string,
): Promise<void> {
  try {
    await db
      .collection('chats')
      .doc(chatId)
      .collection('memberStats')
      .doc(senderId)
      .set({ messageCount: FieldValue.increment(1), lastMessageAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('[memberStats] increment failed', { chatId, senderId, err });
  }
}
