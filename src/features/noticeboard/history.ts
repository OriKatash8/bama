/**
 * The noticeboard's History button only shows when there is something in it: a
 * sent offer, or a hidden notice that can still be restored (its project exists
 * and is open, see useHiddenProjects).
 */
export function hasNoticeHistory(sentOfferCount: number, restorableHiddenCount: number): boolean {
  return sentOfferCount > 0 || restorableHiddenCount > 0;
}

/** How long an entry stays in History before it drops out of the list. */
export const HISTORY_WINDOW_DAYS = 2;
export const HISTORY_WINDOW_MS = HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Whether an entry is still young enough to appear in History.
 *
 * Filter on read: nothing is deleted, so a sent offer that ages out of the list
 * is still live for the client, and a hidden notice stays hidden from the board.
 *
 * `atMs` is the moment the entry was created (an offer) or hidden (a notice), in
 * milliseconds. Zero or missing means the moment is unknown — a freshly written
 * offer whose serverTimestamp has not come back yet reads that way — so an
 * undated entry is KEPT rather than hidden the instant it is made.
 */
export function isWithinHistoryWindow(atMs: number | undefined, now = Date.now()): boolean {
  if (!atMs) return true;
  return now - atMs < HISTORY_WINDOW_MS;
}
