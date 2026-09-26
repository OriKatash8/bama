import {
  collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';

/**
 * Blocking, stored at `users/{uid}/blocks/{blockedUid}`.
 *
 * WHY A SUBCOLLECTION UNDER THE USER, and not a `blockedUsers` array on the user
 * document: `users/{uid}` is readable by every signed-in user. An array there
 * would publish who you blocked to the person you blocked. The subcollection is
 * owner-read-only, so the list is private — while firestore.rules can still read
 * it with get(), because rules are not subject to rules.
 *
 * WHY NOT `users/{uid}/private/…`: that path's rule pins docId to 'contact' with
 * an exact field allowlist, for the phone number. Blocks get their own path
 * rather than loosening a rule that is deliberately tight.
 */

export function blocksCol(userId: string) {
  return collection(db, 'users', userId, 'blocks');
}

export async function blockUser(currentUserId: string, targetUserId: string): Promise<void> {
  if (currentUserId === targetUserId) return;
  await setDoc(doc(db, 'users', currentUserId, 'blocks', targetUserId), {
    blockedAt: serverTimestamp(),
  });
}

export async function unblockUser(currentUserId: string, targetUserId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', currentUserId, 'blocks', targetUserId));
}

/** Live list of uids the user has blocked. The doc id IS the blocked uid. */
export function subscribeBlocks(
  userId: string,
  callback: (blockedIds: string[]) => void,
): Unsubscribe {
  return onSnapshot(
    blocksCol(userId),
    (snap) => callback(snap.docs.map((d) => d.id)),
    (error) => {
      // Non-fatal: an empty block list degrades to showing everything, which is
      // the pre-blocking behaviour rather than a broken screen.
      console.error('[blocks] subscription failed:', (error as { code?: string })?.code, error);
      callback([]);
    },
  );
}
