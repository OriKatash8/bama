import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Native-only haptic feedback.
 *
 * expo-haptics does not no-op on web — it falls through to the Web Vibration
 * API, silent on desktop Chrome but capable of buzzing a phone browser. This
 * app is tested on web and on iPhone and the two must behave the same, so the
 * platform gate lives here rather than being left to the module.
 *
 * Both calls are fire-and-forget: every call site is a touch handler, and a
 * device with no haptics motor rejects. Swallowing that here keeps an
 * unhandled rejection out of a press.
 */

function fire(run: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  void run().catch(() => {});
}

/** Light tick for a selection changing — a role picked, a pill switched. */
export function tapFeedback(): void {
  fire(() => Haptics.selectionAsync());
}

/** A definite commit — a seat added or removed, a step advanced. */
export function commitFeedback(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/**
 * The press was heard and refused — validation failed, nothing advanced.
 * A notification pattern rather than an impact, so it is discriminable from a
 * commit by feel alone. Pair it with taking the user to the problem; on its own
 * a buzz says "no" without saying "where".
 */
export function warnFeedback(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
