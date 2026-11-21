import { useWindowDimensions } from 'react-native';

/** Below this width the admin and community-owner screens switch to their phone layout. The
 *  same threshold `StatGrid` already uses to go to one column. */
export const PHONE_MAX_WIDTH = 420;

/** True on a phone-width window (iPhone portrait, or web at ~375px). */
export function useIsPhone(): boolean {
  return useWindowDimensions().width < PHONE_MAX_WIDTH;
}
