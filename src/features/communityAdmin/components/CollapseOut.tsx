import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { EASE_OUT, MOTION } from '../theme';

/**
 * A row that fades and folds its height away when `leaving` turns true, then
 * calls `onGone`. `onGone` runs on a timer, not an animation callback —
 * Reanimated 4 on web never invokes those. Reduced motion skips straight to
 * gone. If `leaving` flips back (a failed write), the row simply stays.
 */
export function CollapseOut({ leaving, onGone, children }: { leaving: boolean; onGone: () => void; children: ReactNode }) {
  const reduce = useReducedMotion();
  const [height, setHeight] = useState<number | null>(null);
  const progress = useSharedValue(1);
  // The parent passes a fresh closure every render; keep the latest in a ref
  // so the timer below isn't restarted by each re-render.
  const onGoneRef = useRef(onGone);
  useEffect(() => {
    onGoneRef.current = onGone;
  });

  useEffect(() => {
    if (!leaving) {
      progress.value = 1;
      return;
    }
    if (reduce) {
      onGoneRef.current();
      return;
    }
    progress.value = withTiming(0, { duration: MOTION.rowLeave, easing: Easing.bezier(...EASE_OUT) });
    const timer = setTimeout(() => onGoneRef.current(), MOTION.rowLeave);
    return () => clearTimeout(timer);
  }, [leaving, reduce, progress]);

  const style = useAnimatedStyle(() => {
    if (height === null || progress.value === 1) return { opacity: progress.value };
    return { opacity: progress.value, height: height * progress.value, overflow: 'hidden' as const };
  });

  return (
    <Animated.View
      style={style}
      onLayout={(e: LayoutChangeEvent) => {
        if (!leaving) setHeight(e.nativeEvent.layout.height);
      }}
    >
      {children}
    </Animated.View>
  );
}
