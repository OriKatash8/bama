/**
 * Pure geometry for the dashboard charts. Every function here is safe on the
 * inputs that break charts: width 0, one point, all zeros, no data. Nothing
 * returns NaN — a NaN in path data makes an SVG silently draw nothing.
 */

export type Insets = { left: number; right: number; top: number; bottom: number };
export type Pt = [number, number];

export const FLOW_H = 236;
export const FLOW_INSETS: Insets = { left: 30, right: 12, top: 12, bottom: 26 };
export const MARKET_H = 236;
export const MARKET_INSETS: Insets = { left: 28, right: 10, top: 18, bottom: 26 };
export const SPARK_H = 34;
const SPARK_PAD = 2;

/** Flow y-max: at least 6, rounded up to an even number (so /4 ticks stay tidy). */
export function flowNiceMax(values: number[]): number {
  const m = Math.max(6, ...values.filter(Number.isFinite));
  return Math.ceil(m / 2) * 2;
}

/** Market y-max: rounded up to a multiple of 5, never 0. */
export function marketNiceMax(values: number[]): number {
  const m = Math.max(0, ...values.filter(Number.isFinite));
  return Math.max(5, Math.ceil(m / 5) * 5);
}

/** Five grid values, 0 → max, for the four gaps between them. */
export function gridValues(niceMax: number): number[] {
  return [0, 1, 2, 3, 4].map((k) => (niceMax * k) / 4);
}

/** Axis number: whole when whole, else one decimal (6/4 → "1.5"). */
export function tickLabel(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * x for point i of n across the plot. One point sits in the middle — the usual
 * `i / (n - 1)` would divide by zero.
 */
export function xAt(i: number, n: number, width: number, ins: Insets): number {
  const inner = Math.max(0, width - ins.left - ins.right);
  return n <= 1 ? ins.left + inner / 2 : ins.left + (i * inner) / (n - 1);
}

export function yAt(v: number, niceMax: number, height: number, ins: Insets): number {
  const inner = Math.max(0, height - ins.top - ins.bottom);
  const frac = niceMax > 0 ? Math.min(1, Math.max(0, v / niceMax)) : 0;
  return height - ins.bottom - frac * inner;
}

/** About five x labels: every round(n/5)-th point, plus always the last. */
export function xLabelIndices(n: number): number[] {
  if (n <= 0) return [];
  const step = Math.max(1, Math.round(n / 5));
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (i % step === 0 || i === n - 1) out.push(i);
  return out;
}

/** The point index under pixel x — the crosshair snaps to the nearest one. */
export function nearestIndex(px: number, n: number, width: number, ins: Insets): number {
  if (n <= 1) return 0;
  const inner = Math.max(1, width - ins.left - ins.right);
  const i = Math.round(((px - ins.left) * (n - 1)) / inner);
  return Math.max(0, Math.min(n - 1, i));
}

const f = (v: number) => v.toFixed(1);

export function linePath(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ');
}

/** The line closed down to the baseline, for the gradient fill. */
export function areaPath(pts: Pt[], baseY: number): string {
  if (pts.length === 0) return '';
  const last = pts[pts.length - 1];
  return `${linePath(pts)} L${f(last[0])} ${f(baseY)} L${f(pts[0][0])} ${f(baseY)} Z`;
}

/** Polyline length — what strokeDashoffset draws in from. No DOM measuring needed. */
export function pathLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

/** A sparkline's points: min→max fills the 34px height; a flat series sits mid-height. */
export function sparkPoints(values: number[], width: number): Pt[] {
  const n = values.length;
  if (n === 0 || width <= 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const inner = Math.max(0, width - SPARK_PAD * 2);
  return values.map((v, i) => [
    n <= 1 ? width / 2 : SPARK_PAD + (i * inner) / (n - 1),
    span === 0 ? SPARK_H / 2 : SPARK_H - SPARK_PAD - ((v - min) / span) * (SPARK_H - SPARK_PAD * 2),
  ]);
}

/** Bar band layout: the band is the hover target, the bar is min(30, band - 8). */
export function barLayout(n: number, width: number, ins: Insets) {
  const inner = Math.max(0, width - ins.left - ins.right);
  const band = n > 0 ? inner / n : 0;
  const barW = Math.max(2, Math.min(30, band - 8));
  return {
    band,
    barW,
    bandX: (i: number) => ins.left + band * i,
    centerX: (i: number) => ins.left + band * i + band / 2,
  };
}

/** Value labels on every other bar, and always on the last one. */
export function showsValueLabel(i: number, n: number): boolean {
  return i % 2 === 0 || i === n - 1;
}

/** Weeks the market chart shows for a range: never fewer than four bars. */
export function marketWeeks(rangeDays: number): number {
  return Math.max(4, Math.round(rangeDays / 7));
}
