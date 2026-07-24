import type { Review } from '@core/types/project';

export type AverageRating = {
  average: number;
  count: number;
};

export function computeAverageRating(reviews: Review[]): AverageRating {
  const count = reviews.length;
  if (count === 0) return { average: 0, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return { average: sum / count, count };
}
