/**
 * Can a member leave (remove from their list) a PROJECT group chat yet?
 *
 * Only once the project is completed, its dispute window is over, and no
 * dispute is open — the conversation is the record a dispute is decided on, so
 * nobody may walk out of it while one could still be raised or is under review.
 * A cancelled project stays unlocked. The same for client and professional, and
 * deliberately NOT connected to fee payment in any way.
 *
 * firestore.rules (chats update, groupLeaveAllowed) enforces the same rule; this
 * only decides what the row shows. Keep the two in step.
 */

/**
 * A Firestore Timestamp (toMillis), the app's `{ seconds, nanoseconds }` shape
 * of one, or a plain ms number.
 */
type WindowEnd = { toMillis(): number } | { seconds: number; nanoseconds?: number } | number | null | undefined;

export type ChatLeaveProject = {
  status?: string;
  /** Latest still-open contest window, derived onto the project. null/absent = none open. */
  disputeWindowEndsAt?: WindowEnd;
  /** Any engagement on the project under admin review (a dispute). */
  adminReviewPending?: boolean;
};

export type ChatLeaveLock =
  | { kind: 'open' }
  | { kind: 'dispute' }
  | { kind: 'until'; date: Date }
  /** The project is still running: leaving is not offered at all. */
  | { kind: 'active' };

function windowEndMs(w: WindowEnd): number | null {
  if (w == null) return null;
  if (typeof w === 'number') return w;
  if ('toMillis' in w && typeof w.toMillis === 'function') return w.toMillis();
  if ('seconds' in w && typeof w.seconds === 'number') return w.seconds * 1000 + Math.floor((w.nanoseconds ?? 0) / 1e6);
  return null;
}

export function chatLeaveLock(
  project: ChatLeaveProject,
  /** The viewer's own engagement (professionals only; a client cannot read fees). */
  myFee: { adminReviewPending?: boolean } | null | undefined,
  now: number = Date.now(),
): ChatLeaveLock {
  if (project.status === 'cancelled') return { kind: 'open' };
  if (project.status !== 'completed') return { kind: 'active' };
  if (project.adminReviewPending === true || myFee?.adminReviewPending === true) return { kind: 'dispute' };
  const ends = windowEndMs(project.disputeWindowEndsAt);
  if (ends != null && now <= ends) return { kind: 'until', date: new Date(ends) };
  return { kind: 'open' };
}
