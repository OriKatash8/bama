/**
 * Pure pieces of the client card's carousel, kept out of the component so the
 * two things most likely to break — direction and what happens when the shown
 * professional is resolved — are testable without gestures.
 */

/** Minimum horizontal travel (px) before a drag counts as a swipe. */
export const SWIPE_THRESHOLD = 40;

/**
 * Which way a horizontal swipe moves: +1 next, -1 previous, 0 nothing.
 *
 * LTR: swiping LEFT (dx < 0) brings in the next professional, like turning a page.
 * RTL: mirrored — Hebrew reads right to left, so the next one comes from the left
 * and swiping RIGHT (dx > 0) brings it in.
 */
export function swipeStep(dx: number, rtl: boolean, threshold = SWIPE_THRESHOLD): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold) return 0;
  const towardNext = rtl ? dx > 0 : dx < 0;
  return towardNext ? 1 : -1;
}

/**
 * Which professional to show after the pending list changed.
 *
 * Tracked by id, not by position: if someone EARLIER in the list is resolved,
 * the shown professional stays on screen. If the shown one is resolved himself,
 * the index clamps and the next professional — who has slid into that position —
 * is shown ("advances"); past the end, the new last one.
 */
export function resolveShownIndex(ids: readonly string[], shownId: string | null, lastIndex: number): number {
  if (ids.length === 0) return 0;
  const at = shownId ? ids.indexOf(shownId) : -1;
  if (at !== -1) return at;
  return Math.max(0, Math.min(lastIndex, ids.length - 1));
}
