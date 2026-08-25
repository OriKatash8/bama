import { writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@core/firebase/config';

/**
 * Soft-cancel a project (the client's "delete" action). Instead of hard-deleting
 * — which the security rules forbid for offers/chats anyway — this marks the
 * project `cancelled` and archives its group chat with reason `cancelled`.
 *
 * The result: the client stops seeing it in My Projects (filtered by status),
 * while professionals keep a READ-ONLY chat with a "Cancelled" badge and a
 * delete (leave) button in their chat list. Both writes are plain UPDATEs the
 * client is permitted to make (project owner + chat member).
 */
export async function cancelProject(projectId: string, chatId?: string): Promise<void> {
  const batch = writeBatch(db);

  batch.update(doc(db, 'projects', projectId), {
    status: 'cancelled',
    cancelledAt: serverTimestamp(),
  });

  if (chatId) {
    batch.update(doc(db, 'chats', chatId), {
      archived: true,
      archiveReason: 'cancelled',
      archivedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}
