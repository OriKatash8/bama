/**
 * Throttled "I have read this chat up to now" writer.
 *
 * `request()` writes at once if the last write was at least `minGapMs` ago, otherwise
 * it schedules ONE trailing write for when the gap has passed, so the newest message
 * is always covered without a write per message. `cancel()` drops that pending
 * write: it must run when the user blurs the screen or the app goes to the
 * background, so a read is never recorded after they have left.
 */
export function createReadMarker(write: () => void, minGapMs = 2500, now: () => number = Date.now) {
  let lastWriteAt = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    timer = null;
    lastWriteAt = now();
    write();
  };

  return {
    request() {
      if (timer) return; // the trailing write already covers this
      const wait = minGapMs - (now() - lastWriteAt);
      if (wait <= 0) fire();
      else timer = setTimeout(fire, wait);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    /** True while a trailing write is waiting (for tests). */
    get pending() {
      return timer !== null;
    },
  };
}
