import type { Review } from '@core/types/project';

export type AverageRating = {
  average: number;
  count: number;
};

/**
 * Drop any review still marked unpublished. Reviews are no longer held for any
 * reason — this is a defensive filter over a field that should always be true.
 * A MISSING `published` field means
 * visible (legacy reviews predate the hold), so the test is `!== false` — never
 * a Firestore `where('published','!=',false)`, which would exclude every
 * field-less document and wipe out all existing ratings.
 */
export function visibleReviews(reviews: Review[]): Review[] {
  return reviews.filter((r) => r.published !== false);
}

export function computeAverageRating(reviews: Review[]): AverageRating {
  const visible = visibleReviews(reviews);
  const count = visible.length;
  if (count === 0) return { average: 0, count: 0 };
  const sum = visible.reduce((acc, r) => acc + r.rating, 0);
  return { average: sum / count, count };
}
