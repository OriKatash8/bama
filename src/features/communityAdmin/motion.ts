import { useEffect, useState } from 'react';
import { Easing } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { EASE_OUT } from './theme';

/** cubic-bezier(.22,.8,.2,1) as a function of 0..1. */
export const easeOut = Easing.bezier(...EASE_OUT);

/** Progress 0..1 of a `duration` step starting `delay` ms into a timeline, eased. */
export function stepAt(elapsed: number, delay: number, duration: number): number {
  if (duration <= 0) return 1;
  const raw = Math.min(1, Math.max(0, (elapsed - delay) / duration));
  return easeOut(raw);
}

/**
 * Milliseconds elapsed on a timeline of `totalMs`, driven by
 * requestAnimationFrame and replayed from 0 whenever `replayKey` changes (a
 * new range redraws the charts). Under reduced motion it is always the end.
 *
 * A JS timeline rather than Reanimated animated props: the SVG props here
 * (strokeDashoffset, bar height) re-render the same way on iOS, Android and
 * web, where Reanimated 4's SVG path is unproven in this app.
 */
export function useTimeline(totalMs: number, replayKey: unknown): number {
  const reduce = useReducedMotion();
  const [state, setState] = useState({ key: replayKey, elapsed: 0 });
  // A new key starts over at 0 in this very render, so the end state of the
  // previous run never flashes first (React's adjust-state-during-render pattern).
  if (state.key !== replayKey) setState({ key: replayKey, elapsed: 0 });

  useEffect(() => {
    if (reduce) return;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Math.min(totalMs, Date.now() - start);
      setState((s) => ({ ...s, elapsed }));
      if (elapsed < totalMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replayKey, reduce, totalMs]);

  return reduce ? totalMs : state.elapsed;
}
