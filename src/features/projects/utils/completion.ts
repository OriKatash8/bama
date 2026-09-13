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
/**
 * When this professional's contest window closes — the ONE place the client
 * reads it, mirroring `contestWindowEndsAt()` on the server.
 *
 * `chargeDueAt` IS the window: past it the money has moved (or would have) and a
 * contest becomes a support conversation. `disputeWindowEndsAt` is its
 * predecessor, still carried by records written before the two collapsed into
 * one field, so it is the fallback and never the preference.
 *
 * Returns ms, or null when no window was ever stamped — which is not the same as
 * a closed one. The server falls back to confirmedAt plus the configured window
 * in that case; the client cannot know that window, so callers defer to the
 * callable rather than guessing.
 */
export function contestWindowEndsAt(
  engagement: Pick<ProjectFee, 'chargeDueAt' | 'disputeWindowEndsAt'> | null | undefined,
): number | null {
  const endsAt = engagement?.chargeDueAt ?? engagement?.disputeWindowEndsAt;
  return endsAt?.seconds ? endsAt.seconds * 1000 : null;
}

export function canDispute(
  /** THIS professional's engagement. The window is per engagement now — the
   *  project-level field is a roll-up of everyone's and describes somebody else's
   *  deadline as often as it describes this one's. */
  engagement: Pick<ProjectFee, 'engagementStatus' | 'chargeDueAt' | 'disputeWindowEndsAt'> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!engagement) return false;
  if (engagement.engagementStatus !== 'completed') return false;
  const endsAt = contestWindowEndsAt(engagement);
  if (endsAt === null) return false;
  return now <= endsAt;
}

/**
 * May this professional mark their own engagement finished?
 *
 * MIRRORS the server's guard in `completeEngagementInternal`, which refuses only
 * when the engagement is already terminal. Deliberately NARROWER in one place:
 * the server's TERMINAL set does not include `disputed`, so it would accept a
 * re-completion, but offering "I finished my part" on an engagement the
 * professional has just contested is incoherent — that one is in front of an
 * admin. Narrower than the server is the safe direction; the reverse shows a
 * button the callable then refuses.
 *
 * A fee document with no `engagementStatus` reads as `hired` — the same default
 * the server and the derivation use, so the thousands of pre-Phase-1 records
 * behave as the live ones do.
 */
export function canMarkComplete(
  engagement: Pick<ProjectFee, 'engagementStatus'> | null | undefined,
): boolean {
  if (!engagement) return false;
  const status = engagement.engagementStatus ?? 'hired';
  return status === 'hired' || status === 'end_requested_by_client';
}
