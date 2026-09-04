import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { callFunction } from '@core/firebase/functions';
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
 * The professional accepts their removal. ALL of it — filledSlots, chat
 * membership, their accepted offers, the removal request, `professionalIds` and
 * `slotHolders` (what actually frees the slot for the cap query), and the
 * "X left the project" notice — is done server-side by `freeSlot`, in one batch.
 *
 * The notice used to be a client write here, after the callable returned. It
 * could never succeed: the callable removes this professional from the chat's
 * `members`, and the message-create rule requires membership. It failed every
 * time and was swallowed by a `catch {}` marked non-fatal, so the remaining crew
 * were never told anyone had left. It is now part of the same batch.
 */
export async function acceptRemoval(projectId: string): Promise<void> {
  await freeSlot({ projectId });
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
