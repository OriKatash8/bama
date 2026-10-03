/**
 * Whether a confirmation — the client's "mark complete" (one engagement or all),
 * or the auto-close — closes an engagement.
 *
 * Terminal ones are already finished and are never re-processed (no second
 * charge, no re-stamped window). A DISPUTED one is waiting for an admin: it used
 * to be swept to 'completed' with its neighbours, which settled the dispute
 * against the professional without anyone deciding it — the opposite of what the
 * comment on completeAllEngagements promised ("left for a human"). It now stays
 * disputed, holds the project open (derive.ts), and only resolveFeeDispute ends it.
 */
export const TERMINAL_ENGAGEMENT: ReadonlySet<string> = new Set(['completed', 'withdrawn', 'cancelled']);

export function confirmationCloses(engagementStatus: string | undefined): boolean {
  const s = engagementStatus ?? '';
  if (TERMINAL_ENGAGEMENT.has(s)) return false;
  if (s === 'disputed') return false;
  return true;
}
