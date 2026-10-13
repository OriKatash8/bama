import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAuth } from '../lifecycle/helpers';
import { SYSTEM_USER_ID } from '../system';

/** Where in the app the block was made. Free text from a client is not stored. */
export const BLOCK_CONTEXTS = [
  'profile', 'dm', 'community', 'purchase', 'project', 'message', 'other',
] as const;
export type BlockContext = (typeof BLOCK_CONTEXTS)[number];

export function normalizeContext(raw: unknown): BlockContext {
  return (BLOCK_CONTEXTS as readonly string[]).includes(raw as string) ? (raw as BlockContext) : 'other';
}

/**
 * Block a user AND tell the team, as one write.
 *
 * Apple (Guideline 1.2) requires that blocking also notifies the developer. The
 * block rule used to let the client write `users/{uid}/blocks/{id}` directly,
 * which meant the admin item could be skipped by any client path. Now only this
 * function creates a block (firestore.rules denies client create), and it
 * creates the `reports` entry in the same transaction — there is no way to have
 * one without the other.
 *
 * Idempotent: blocking someone already blocked changes nothing and files no
 * second report.
 */
export const blockUser = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = (request.data ?? {}) as { targetUid?: unknown; context?: unknown; chatId?: unknown };
  const targetUid = data.targetUid;

  if (typeof targetUid !== 'string' || !targetUid) {
    throw new HttpsError('invalid-argument', 'targetUid is required');
  }
  if (targetUid === uid) {
    throw new HttpsError('failed-precondition', 'You cannot block yourself');
  }
  if (targetUid === SYSTEM_USER_ID || targetUid === 'system') {
    throw new HttpsError('failed-precondition', 'This account cannot be blocked');
  }
  const context = normalizeContext(data.context);
  const chatId = typeof data.chatId === 'string' && data.chatId.length <= 128 ? data.chatId : null;

  const blockRef = db.doc(`users/${uid}/blocks/${targetUid}`);
  const targetRef = db.doc(`users/${targetUid}`);
  const blockerRef = db.doc(`users/${uid}`);
  const reportRef = db.collection('reports').doc();

  const created = await db.runTransaction(async (tx) => {
    const [blockSnap, targetSnap, blockerSnap] = await Promise.all([
      tx.get(blockRef), tx.get(targetRef), tx.get(blockerRef),
    ]);
    if (blockSnap.exists) return false;
    if (!targetSnap.exists) throw new HttpsError('not-found', 'User not found');

    const blockerName = (blockerSnap.data()?.displayName as string | undefined) ?? '';
    const targetName = (targetSnap.data()?.displayName as string | undefined) ?? '';

    tx.set(blockRef, { blockedAt: FieldValue.serverTimestamp() });
    tx.set(reportRef, {
      type: 'user_blocked',
      reporterId: uid,
      reporterName: blockerName,
      reportedUserId: targetUid,
      reportedUserName: targetName,
      reason: `${blockerName || uid} blocked ${targetName || targetUid} (from: ${context})`,
      context,
      ...(chatId ? { chatId } : {}),
      evidenceURLs: [] as string[],
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  return { success: true, alreadyBlocked: !created };
});
