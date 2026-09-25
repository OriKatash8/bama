import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentReference,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '@core/firebase/config';

/**
 * The ONE place community membership changes. Every `members` add or remove on
 * a community goes through here so it lands together with its
 * `chats/{chatId}/communityEvents` entry — the log the owner's dashboard
 * charts. The rules only accept an event that describes a membership change
 * made in the same write, which is why nothing here writes one on its own.
 *
 * The event is best-effort, the membership change is not. Production can run
 * rules older than this build (rules deploy separately from the app), and
 * those deny any communityEvents write — which fails the whole batch, so
 * leaving a community broke. So each write is tried with its event first; if
 * that is refused (`permission-denied`), it is committed again without the
 * event, with a warning. Any other error, or a refusal of the membership
 * change itself, still surfaces.
 */

type EventType = 'join' | 'leave';

function eventRef(chatId: string): DocumentReference {
  return doc(collection(db, 'chats', chatId, 'communityEvents'));
}

function logEvent(w: WriteBatch | Transaction, chatId: string, type: EventType, userId: string) {
  // WriteBatch.set and Transaction.set share a signature; TS can't unify the union.
  (w as WriteBatch).set(eventRef(chatId), { type, userId, at: serverTimestamp() });
}

function requestRef(chatId: string, userId: string) {
  return doc(db, 'chats', chatId, 'joinRequests', userId);
}

const isPermissionDenied = (e: unknown) => (e as { code?: string } | null)?.code === 'permission-denied';

/** Run `write(true)` (with events); if the rules refuse it, run `write(false)`. */
export async function withEvents<T>(what: string, write: (withEvents: boolean) => Promise<T>): Promise<T> {
  try {
    return await write(true);
  } catch (err) {
    if (!isPermissionDenied(err)) throw err;
    console.warn(`[communityMembership] ${what}: event refused by the rules; saving without it.`);
    return write(false);
  }
}

/**
 * Approve one request: request → approved, user → members, 'join' logged — all
 * or nothing. Resolves false (writing nothing) if the request is no longer
 * pending, e.g. the requester withdrew it or another device already decided.
 */
export async function approveJoinRequest(chatId: string, userId: string): Promise<boolean> {
  return withEvents('approve', (events) =>
    runTransaction(db, async (tx) => {
      const [req, chat] = await Promise.all([tx.get(requestRef(chatId, userId)), tx.get(doc(db, 'chats', chatId))]);
      if (!req.exists() || req.data().status !== 'pending') return false;
      tx.update(requestRef(chatId, userId), { status: 'approved', decidedAt: serverTimestamp() });
      // Already in (added some other way): settle the request, log nothing.
      const members = (chat.data()?.members as string[] | undefined) ?? [];
      if (!members.includes(userId)) {
        tx.update(doc(db, 'chats', chatId), { members: arrayUnion(userId) });
        if (events) logEvent(tx, chatId, 'join', userId);
      }
      return true;
    }),
  );
}

/**
 * Three writes per approval; a batch caps at 500, so stay well under it.
 * Each chunk is atomic; a failure part-way leaves earlier chunks applied.
 */
const APPROVE_CHUNK = 150;

/**
 * `currentMembers` matters: the rules refuse a 'join' for someone already in
 * `members` (it isn't a real join), and one refused write fails the whole
 * batch. Anyone already in just has their request marked approved.
 */
export async function approveAllJoinRequests(
  chatId: string,
  userIds: string[],
  currentMembers: string[],
): Promise<void> {
  const already = new Set(currentMembers);
  for (let i = 0; i < userIds.length; i += APPROVE_CHUNK) {
    const chunk = userIds.slice(i, i + APPROVE_CHUNK);
    const joining = chunk.filter((uid) => !already.has(uid));
    await withEvents('approve all', async (events) => {
      const batch = writeBatch(db);
      for (const uid of chunk) {
        batch.update(requestRef(chatId, uid), { status: 'approved', decidedAt: serverTimestamp() });
      }
      if (events) for (const uid of joining) logEvent(batch, chatId, 'join', uid);
      if (joining.length > 0) batch.update(doc(db, 'chats', chatId), { members: arrayUnion(...joining) });
      await batch.commit();
    });
  }
}

export async function rejectJoinRequest(chatId: string, userId: string): Promise<void> {
  await updateDoc(requestRef(chatId, userId), { status: 'rejected', decidedAt: serverTimestamp() });
}

function removeMember(chatId: string, userId: string, what: string) {
  return withEvents(what, async (events) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'chats', chatId), { members: arrayRemove(userId) });
    if (events) logEvent(batch, chatId, 'leave', userId);
    await batch.commit();
  });
}

/** The owner removing someone. The owner can never be removed. */
export async function removeCommunityMember(chatId: string, userId: string, ownerId: string): Promise<void> {
  if (userId === ownerId) return;
  await removeMember(chatId, userId, 'remove');
}

/** A member leaving on their own. */
export async function leaveCommunity(chatId: string, userId: string): Promise<void> {
  await removeMember(chatId, userId, 'leave');
}

/** The owner's own 'join', written in the batch that creates the community. */
export function logOwnerJoin(batch: WriteBatch, chatId: string, ownerId: string) {
  logEvent(batch, chatId, 'join', ownerId);
}
