import type { ProjectRequest } from '@core/types/project';

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
  project: Pick<ProjectRequest, 'completion' | 'disputeWindowEndsAt'>,
  now: number = Date.now(),
): boolean {
  if (project.completion?.state !== 'confirmed') return false;
  const endsAt = project.disputeWindowEndsAt;
  // No stamp means the project was confirmed before the field existed. The server
  // falls back to confirmedAt + the configured window; the client cannot know that
  // window, so it defers rather than guessing — the callable is the authority.
  if (!endsAt?.seconds) return false;
  return now <= endsAt.seconds * 1000;
}
