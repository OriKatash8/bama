import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';
import { sendMessage } from './chatService';
import type { RemovalRequest } from '@core/types/project';

const freeSlot = callFunction<{ projectId: string }, { ok: boolean; chatId: string | null }>(
  'freeSlot',
);

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

/**
 * The professional accepts their removal. All of it — filledSlots, the chat
 * membership, their accepted offers, the request status, and crucially
 * `professionalIds` (what actually frees the slot for the cap query) — is done
 * server-side by the `freeSlot` callable. Clients can no longer write those
 * fields, and the callable refuses once completion is confirmed so an owed fee
 * cannot be escaped by leaving.
 */
export async function acceptRemoval(
  projectId: string,
  chatId: string,
  professionalId: string,
  systemMessage: string,
): Promise<void> {
  await freeSlot({ projectId });

  // System message is non-atomic — send after the callable commits.
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
