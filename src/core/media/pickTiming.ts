/**
 * Dev-only timing for "tap → picker open → picker resolved → preview shown", to see where
 * the wait is. Does nothing in a release build.
 */
export function startPickTiming(label: string) {
  if (!__DEV__) return { mark: (_step: string) => {} };
  const t0 = Date.now();
  let last = t0;
  return {
    mark(step: string) {
      const now = Date.now();
      console.log(`[pick:${label}] ${step} +${now - last}ms (total ${now - t0}ms)`);
      last = now;
    },
  };
}
