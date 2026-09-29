import { Platform } from 'react-native';
import { create } from 'zustand';

/**
 * Whether the app was launched by tapping a notification. The root (`/`) sends
 * a restored user to their mode's home — but a notification's target must win,
 * so the root waits until this is known and stays out of the way while a
 * launch tap is being routed (useNotificationRouting).
 *
 * Web has no notification taps, so it starts out checked.
 */
type LaunchIntentState = {
  /** The launch notification has been looked for. */
  checked: boolean;
  /** A launch tap is waiting to be routed. */
  hasPending: boolean;
  setLaunch: (hasPending: boolean) => void;
  settle: () => void;
};

export const useLaunchIntentStore = create<LaunchIntentState>((set) => ({
  checked: Platform.OS === 'web',
  hasPending: false,
  setLaunch: (hasPending) => set({ checked: true, hasPending }),
  settle: () => set({ checked: true, hasPending: false }),
}));
