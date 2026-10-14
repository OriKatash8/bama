import {
  collection, deleteDoc, doc, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';
import { useBlockStore } from '@core/stores/blockStore';

/** Where in the app a block was made; recorded on the admin report. */
export type BlockContext =
  | 'profile' | 'dm' | 'community' | 'purchase' | 'project' | 'message' | 'other';

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

/**
 * Block through the `blockUser` callable, not a direct write. The callable
 * writes the block AND files a `user_blocked` report for the admins in one
 * transaction (App Store Guideline 1.2: blocking must notify the developer), and
 * firestore.rules denies a client creating a block, so the two cannot come apart.
 *
 * The store is updated as soon as the callable returns instead of waiting for
 * the snapshot listener, so everything from that user disappears at once.
 */
export async function blockUser(
  currentUserId: string,
  targetUserId: string,
  options: { context?: BlockContext; chatId?: string } = {},
): Promise<void> {
  if (currentUserId === targetUserId) return;
  // Loaded on use: the Block sheet is mounted by many screens that never block.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { callFunction } = require('@core/firebase/functions') as typeof import('@core/firebase/functions');
  await callFunction<
    { targetUid: string; context: BlockContext; chatId?: string },
    { success: boolean; alreadyBlocked: boolean }
  >('blockUser')({
    targetUid: targetUserId,
    context: options.context ?? 'other',
    ...(options.chatId ? { chatId: options.chatId } : {}),
  });
  const { blocked, setBlocked } = useBlockStore.getState();
  if (!blocked.includes(targetUserId)) setBlocked([...blocked, targetUserId]);
}

export async function unblockUser(currentUserId: string, targetUserId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', currentUserId, 'blocks', targetUserId));
  const { blocked, setBlocked } = useBlockStore.getState();
  if (blocked.includes(targetUserId)) setBlocked(blocked.filter((id) => id !== targetUserId));
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
