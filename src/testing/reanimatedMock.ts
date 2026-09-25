/**
 * The sheet renders PressableScale, which pulls in Reanimated — and Reanimated's
 * native module is not there under Jest. Same shape as the home screen's own
 * mock (home/__tests__/roleTiles.test.tsx), kept in one place because three
 * DirectProjectSheet suites need it.
 *
 * `withSpring` returns the target value and the spring callback is NEVER
 * invoked, which is what Reanimated 4 does on web. Nothing may depend on it.
 */
export function reanimatedMock() {
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RN.View, createAnimatedComponent: (C: unknown) => C },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withSpring: (v: number) => v,
    // Timing helpers jump to their end value, like withSpring above.
    withTiming: (v: number) => v,
    withDelay: (_ms: number, v: number) => v,
    withRepeat: (v: number) => v,
    withSequence: (...vs: number[]) => vs[vs.length - 1],
    cancelAnimation: () => {},
    Easing: { bezier: () => (t: number) => t, out: (f: unknown) => f, cubic: (t: number) => t, linear: (t: number) => t },
    useAnimatedProps: (fn: () => unknown) => fn(),
    runOnJS: (fn: unknown) => fn,
    useReducedMotion: () => false,
  };
}
