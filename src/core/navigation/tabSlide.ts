import { Dimensions } from 'react-native';
import type { BottomTabNavigationOptions } from 'expo-router/build/react-navigation/bottom-tabs/types';

/**
 * Switching tabs — by tapping the bar or swiping left/right — slides the whole
 * screen across, the way the stack slides between the chat list, a chat and
 * its project details. The built-in 'shift' only nudges the screen; this moves
 * it a full width.
 *
 * The next tab comes in from the right and the previous one from the left, in
 * both languages: the tab order is not mirrored in Hebrew, so "next" is always
 * to the right, which is also the side the tab-swipe gesture pulls from.
 */
export const TAB_SLIDE: Required<Pick<BottomTabNavigationOptions, 'sceneStyleInterpolator' | 'transitionSpec'>> = {
  sceneStyleInterpolator: ({ current }) => {
    const width = Dimensions.get('window').width;
    return {
      sceneStyle: {
        transform: [
          { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width, 0, width] }) },
        ],
      },
    };
  },
  // The stack's own iOS push spring (react-navigation's TransitionIOSSpec).
  transitionSpec: {
    animation: 'spring',
    config: {
      stiffness: 1000,
      damping: 500,
      mass: 3,
      overshootClamping: true,
      restDisplacementThreshold: 10,
      restSpeedThreshold: 10,
    },
  },
};
