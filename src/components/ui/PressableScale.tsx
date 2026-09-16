import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { commitFeedback, tapFeedback } from '@core/haptics';

/**
 * A press that behaves like a physical object.
 *
 * Springs, not timings, because a spring animates from wherever the value
 * currently is — so a press interrupted mid-release picks up from the live
 * scale instead of jumping. The two configs read as Apple's pair: `duration`
 * is the response, `dampingRatio` the damping.
 *
 * Press-down is critically damped (1.0) — the finger arriving is not a
 * momentum event and an overshoot there reads as wobble. Release gets a little
 * bounce (0.8), because the finger lifting IS the momentum.
 */

const PRESS_IN = { duration: 200, dampingRatio: 1 } as const;
const PRESS_OUT = { duration: 300, dampingRatio: 0.8 } as const;

/**
 * One element carries both the caller's layout style and the transform. An
 * Animated.View wrapped around a plain Pressable would put them on different
 * nodes, and any target sized `width: '100%'` — the date squares — would then
 * resolve its width against a shrink-wrapped parent and collapse.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale at full press. Smaller reads as heavier. */
  activeScale?: number;
  /**
   * Opt-in, so a haptic stays a signal rather than noise. It fires on RELEASE,
   * with the state change it accompanies — a buzz on press-down would arrive a
   * whole press before the thing it is confirming.
   */
  haptic?: 'tap' | 'commit';
};

export function PressableScale({
  children,
  style,
  activeScale = 0.97,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  // Reanimated's springs already honour the system setting, but for a press
  // that would only snap instantly to the smaller size. Reduced motion should
  // mean no size change at all.
  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        if (!reduceMotion) scale.value = withSpring(activeScale, PRESS_IN);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduceMotion) scale.value = withSpring(1, PRESS_OUT);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic === 'tap') tapFeedback();
        else if (haptic === 'commit') commitFeedback();
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
