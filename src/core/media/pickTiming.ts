/**
 * Dev-only step timer: logs `[prefix] step +Xms (total Yms)` to the console. Does nothing in a
 * release build. Used to see where a slow media flow spends its time.
 */
export function createDevTimer(prefix: string) {
  if (!__DEV__) return { mark: (_step: string) => {} };
  const t0 = Date.now();
  let last = t0;
  return {
    mark(step: string) {
      const now = Date.now();
      console.log(`[${prefix}] ${step} +${now - last}ms (total ${now - t0}ms)`);
      last = now;
    },
  };
}

/** "tap → picker open → picker resolved → preview shown" for the media pickers. */
export function startPickTiming(label: string) {
  return createDevTimer(`pick:${label}`);
}
