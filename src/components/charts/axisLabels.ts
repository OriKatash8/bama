/**
 * The x-axis labels a chart actually prints: all of them when they fit,
 * otherwise every k-th one (counted back from the newest, so "now" is always
 * labelled) and '' in between. The full labels stay for tooltips.
 */
export function axisLabels(labels: string[], max = 8): string[] {
  const n = labels.length;
  if (n <= max) return labels;
  const step = Math.ceil(n / max);
  return labels.map((l, i) => ((n - 1 - i) % step === 0 ? l : ''));
}
