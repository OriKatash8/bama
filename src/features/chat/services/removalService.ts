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

/**
 * All removal requests on a project — for the CLIENT, who needs every member's
 * status to render the pending chips.
 *
 * ONLY the client may run this. The read rule's other clause is
 * `professionalId == request.auth.uid`, where `professionalId` is the
 * document-ID wildcard; a collection query cannot bind it, so production denies
 * the query outright for a professional. (The client's clause reads the parent
 * project, which is document-independent, so their query is provable and
 * allowed.) A professional must use `listenToMyRemovalRequest` instead.
 */
export function listenToRemovalRequests(
  projectId: string,
  callback: (requests: RemovalRequest[]) => void,
): () => void {
  return onSnapshot(
    collection(db, `projects/${projectId}/removalRequests`),
    (snap) => {
      callback(snap.docs.map((d) => ({ ...d.data() } as RemovalRequest)));
    },
    (err) => {
      // NEVER swallow this into an empty list. A permission-denied here is
      // indistinguishable from "no pending removals", which is exactly how the
      // professional's missing accept-banner went unnoticed.
      console.error('[removal] listenToRemovalRequests denied/failed:', err?.code, err);
      callback([]);
    },
  );
}

/**
 * ONE professional's own removal request. A document read, not a query — the
 * rule permits `get` on the doc whose id is your uid, while denying an
 * unconstrained `list` over the collection.
 *
 * The professional only ever has one request per project (the document id IS
 * their uid), so this is both the correct shape and immune to the query-rule
 * problem above.
 */
export function listenToMyRemovalRequest(
  projectId: string,
  professionalId: string,
  callback: (request: RemovalRequest | null) => void,
): () => void {
  return onSnapshot(
    doc(db, `projects/${projectId}/removalRequests/${professionalId}`),
    (snap) => callback(snap.exists() ? ({ ...snap.data() } as RemovalRequest) : null),
    (err) => {
      console.error('[removal] listenToMyRemovalRequest denied/failed:', err?.code, err);
      callback(null);
    },
  );
}
