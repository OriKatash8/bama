import type { Chat } from '../types';

/**
 * Read receipts exist for project group chats (`group`) and marketplace chats
 * (`purchase`) only. Everything else — DMs, communities and their channels — has
 * no icon, no "Message info" and no read-state writes.
 */
export function isReceiptChat(type: Chat['type'] | null | undefined): boolean {
  return type === 'group' || type === 'purchase';
}

/** What a sender sees next to their own timestamp. */
export type ReceiptStatus = 'sending' | 'sent' | 'seen';

type MillisLike = { toMillis: () => number } | null | undefined;

/** uid → the moment that member last had the chat open (milliseconds). */
export type ReadMap = Record<string, number>;

/** Firestore Timestamp (or null while the server has not confirmed it) → ms. */
export function toMillis(ts: MillisLike): number | null {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null;
}

/**
 * Where one own message stands.
 *
 * - `sending`: the server has not stamped it yet (`timestamp` is null locally).
 * - `seen`: EVERY other current member's watermark is at or past the message.
 * - `sent`: confirmed, but at least one member has not caught up. A chat with no
 *   other member can never be `seen`.
 *
 * Members who left are simply not in `members`, so they stop counting. A member
 * who joined later counts until they first open the chat; opening it moves their
 * watermark past every earlier message (the watermark is a single timestamp).
 */
export function receiptStatus(
  timestamp: MillisLike,
  senderId: string,
  members: readonly string[],
  readMap: ReadMap,
): { status: ReceiptStatus; seenBy: string[]; notSeen: string[] } {
  const sentAt = toMillis(timestamp);
  const others = members.filter((m) => m !== senderId);
  if (sentAt === null) return { status: 'sending', seenBy: [], notSeen: others };
  const seenBy = others.filter((m) => (readMap[m] ?? -Infinity) >= sentAt);
  const notSeen = others.filter((m) => !seenBy.includes(m));
  const status: ReceiptStatus = others.length > 0 && notSeen.length === 0 ? 'seen' : 'sent';
  return { status, seenBy, notSeen };
}
