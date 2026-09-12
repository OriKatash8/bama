import type { ProjectFee } from '@core/types/project';

/**
 * Is this professional still inside their window to dispute a confirmed
 * completion?
 *
 * Reads the deadline STAMPED AT CONFIRMATION rather than recomputing it from
 * today's config, so the window a professional was given cannot be shortened by a
 * later config edit. Mirrors the server guard in `disputeFeeByPro`, so the button
 * and the callable agree — if they drift, the button either appears when the call
 * will refuse, or hides while it would succeed.
 *
 * Pure, and in utils rather than the service, so it can be tested without pulling
 * in the Firebase SDK (the convention utils/fee.ts already follows).
 */
export function canDispute(
  /** THIS professional's engagement. The window is per engagement now — the
   *  project-level field is a roll-up of everyone's and describes somebody else's
   *  deadline as often as it describes this one's. */
  engagement: Pick<ProjectFee, 'engagementStatus' | 'chargeDueAt' | 'disputeWindowEndsAt'> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!engagement) return false;
  if (engagement.engagementStatus !== 'completed') return false;
  // chargeDueAt is THE window; disputeWindowEndsAt is its predecessor, still
  // present on records written before the two collapsed. Mirrors
  // contestWindowEndsAt() on the server — if these two disagree, the button
  // appears when the call will refuse, or hides while it would succeed.
  const endsAt = engagement.chargeDueAt ?? engagement.disputeWindowEndsAt;
  // No stamp means the project was confirmed before the field existed. The server
  // falls back to confirmedAt + the configured window; the client cannot know that
  // window, so it defers rather than guessing — the callable is the authority.
  if (!endsAt?.seconds) return false;
  return now <= endsAt.seconds * 1000;
}
