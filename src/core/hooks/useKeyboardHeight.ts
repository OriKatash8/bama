import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Height of the on-screen keyboard (0 when hidden). Used where KeyboardAvoidingView is
 * not enough, e.g. inside a Modal, which is its own window and is not resized by the
 * activity's softInputMode on Android.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // No virtual keyboard on web: nothing to listen to, the layout stays as it is.
    if (Platform.OS === 'web') return;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillChangeFrame' : 'keyboardDidShow', (e) =>
      setHeight(e.endCoordinates.height > 0 && e.endCoordinates.screenY < 10000 ? e.endCoordinates.height : 0)
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
