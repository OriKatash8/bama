import * as admin from 'firebase-admin';
import { db, FieldValue } from './helpers';

const CLOSED_TEXT = '🏁 הפרויקט הושלם';

/**
 * Close a project's group chat: the 🏁 system message and the read-only flag.
 *
 * The group chat becomes read-only once the work is done — the same flag the
 * BAMA System DMs use, so the message-create rule already enforces it.
 * Read-only tracks COMPLETION only, never payment: a pro settling early does
 * not close the chat, and an unpaid completed chat still closes.
 *
 * The closing notice goes in the SAME batch that closes the chat. readOnly gates
 * the message-create RULE and the Admin SDK is not subject to it, so ordering is
 * not a concern — but both land together or neither does. Without this the chat
 * simply stopped, with nothing saying why.
 */
export function addChatCloseWrites(batch: admin.firestore.WriteBatch, chatId: string): void {
  batch.set(db.collection(`chats/${chatId}/messages`).doc(), {
    senderId: 'system', system: true, text: CLOSED_TEXT,
    timestamp: FieldValue.serverTimestamp(), readBy: [],
  });
  // ONE update on the chat document, not two — a batch applies writes to the
  // same document in order, but expressing it as a single write removes the
  // question entirely.
  batch.update(db.doc(`chats/${chatId}`), {
    readOnly: true,
    readOnlyReason: 'completed',
    readOnlyAt: FieldValue.serverTimestamp(),
    lastMessage: { text: CLOSED_TEXT, senderId: 'system', timestamp: FieldValue.serverTimestamp() },
  });
}

/**
 * Close the chat unless it is already closed, so a project that reaches
 * `completed` by the auto-close never gets a second 🏁. Returns whether it wrote.
 */
export async function closeProjectChatOnce(chatId: string): Promise<boolean> {
  const chat = (await db.doc(`chats/${chatId}`).get()).data();
  if (!chat || chat.readOnly) return false;
  const batch = db.batch();
  addChatCloseWrites(batch, chatId);
  await batch.commit();
  return true;
}
