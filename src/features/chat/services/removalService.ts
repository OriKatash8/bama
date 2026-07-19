import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  writeBatch,
  arrayRemove,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { sendMessage } from './chatService';
import type { FilledSlot, RemovalRequest } from '@core/types/project';

export async function requestRemoval(
  projectId: string,
  professionalId: string,
  clientId: string,
): Promise<void> {
  await setDoc(doc(db, `projects/${projectId}/removalRequests/${professionalId}`), {
    professionalId,
    requestedBy: clientId,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function acceptRemoval(
  projectId: string,
  chatId: string,
  professionalId: string,
  currentFilledSlots: FilledSlot[],
  systemMessage: string,
): Promise<void> {
  const offersSnap = await getDocs(
    query(
      collection(db, 'priceOffers'),
      where('projectId', '==', projectId),
      where('professionalId', '==', professionalId),
      where('status', '==', 'accepted'),
    ),
  );

  const batch = writeBatch(db);

  // Remove from group chat members
  batch.update(doc(db, 'chats', chatId), {
    members: arrayRemove(professionalId),
  });

  // Remove all their filledSlots entries from the project
  const updatedSlots = currentFilledSlots.filter((s) => s.professionalId !== professionalId);
  batch.update(doc(db, 'projects', projectId), { filledSlots: updatedSlots });

  // Mark all their accepted offers as 'removed'
  offersSnap.docs.forEach((d) => batch.update(d.ref, { status: 'removed' }));

  // Mark the removalRequest as accepted
  batch.update(doc(db, `projects/${projectId}/removalRequests/${professionalId}`), {
    status: 'accepted',
  });

  await batch.commit();

  // System message is non-atomic — send after the batch
  try {
    await sendMessage(chatId, professionalId, systemMessage);
  } catch {
    // Non-fatal: removal already committed
  }
}

export function listenToRemovalRequests(
  projectId: string,
  callback: (requests: RemovalRequest[]) => void,
): () => void {
  return onSnapshot(
    collection(db, `projects/${projectId}/removalRequests`),
    (snap) => {
      callback(snap.docs.map((d) => ({ ...d.data() } as RemovalRequest)));
    },
    () => callback([]),
  );
}
