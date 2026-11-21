/** A client's review held back by a "didn't happen" dispute, as the admin sees it. */
export type HeldReview = { rating: number; text: string; authorName: string };

/**
 * The review held for a dispute, from the review docs of one project + professional.
 * Pure. Only a review marked `heldForDispute` counts: an amount dispute holds nothing,
 * and a published review is not "held". The text lives in `body` (and `text`, which
 * the client also writes).
 */
export function heldReviewOf(docs: readonly { data(): Record<string, unknown> }[]): HeldReview | null {
  const held = docs.map((d) => d.data()).find((r) => r.heldForDispute === true);
  if (!held) return null;
  return {
    rating: typeof held.rating === 'number' ? held.rating : 0,
    text: String(held.body ?? held.text ?? ''),
    authorName: String(held.authorName ?? ''),
  };
}
