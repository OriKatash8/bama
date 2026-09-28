import { barLayout, marketNiceMax, type Insets } from '@features/communityAdmin/chartGeometry';

const PAIR_GAP = 3;

/**
 * Two bars per band (client, then pro), centred as a pair. They sit side by
 * side rather than stacked: a user can be both a client and a pro, so the two
 * counts don't add up to the total.
 */
export function groupedBars(n: number, width: number, ins: Insets) {
  const { band, centerX } = barLayout(n, width, ins);
  const barW = Math.max(2, Math.min(16, (band - 8 - PAIR_GAP) / 2));
  return {
    band,
    barW,
    centerX,
    firstX: (i: number) => centerX(i) - PAIR_GAP / 2 - barW,
    secondX: (i: number) => centerX(i) + PAIR_GAP / 2,
  };
}

/** y-max over every series on screen: a multiple of 5, never 0. */
export function regNiceMax(...series: number[][]): number {
  return marketNiceMax(series.flat());
}
