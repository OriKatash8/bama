import { forwardRef, useContext } from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import {
  KeyboardAvoidingView as ControllerKeyboardAvoidingView,
  KeyboardAwareScrollView,
} from 'react-native-keyboard-controller';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

/**
 * The ONE place the app makes room for the keyboard (besides the provider at the root
 * and the chat composer). Two shapes:
 *
 *  - `KeyboardSafeForm`: a scroll view that scrolls the focused input above the
 *    keyboard with a small margin. For a screen or sheet whose content is a form.
 *  - `KeyboardSafeView`: a NON-scrolling container that lifts its content by the
 *    keyboard's height. For a screen that is, or holds, its own FlatList — never wrap
 *    a FlatList / SectionList in `KeyboardSafeForm`: that nests one virtualized list
 *    in a ScrollView.
 *
 * Why not React Native's own: `automaticallyAdjustKeyboardInsets` is iOS-only, and
 * `KeyboardAvoidingView behavior="height"` is unreliable with Android edge-to-edge
 * (the window no longer resizes for the keyboard), so Android inputs were covered.
 *
 * On WEB both fall back to the plain React Native components the app used before, so
 * the web build behaves exactly as it did.
 */

/** Breathing room between the focused input and the top of the keyboard. */
export const KEYBOARD_INPUT_MARGIN = 24;

export type KeyboardSafeFormProps = ScrollViewProps & {
  /** Extra space kept between the focused input and the keyboard. */
  bottomOffset?: number;
};

export const KeyboardSafeForm = forwardRef<ScrollView, KeyboardSafeFormProps>(function KeyboardSafeForm(
  { bottomOffset = KEYBOARD_INPUT_MARGIN, keyboardShouldPersistTaps = 'handled', ...rest },
  ref,
) {
  if (Platform.OS === 'web') {
    return <ScrollView ref={ref} keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...rest} />;
  }
  return (
    <KeyboardAwareScrollView
      ref={ref as never}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...rest}
    />
  );
});

export type KeyboardSafeViewProps = ViewProps & {
  /** Lift only while true (e.g. while a sheet is open). Default true. */
  enabled?: boolean;
  keyboardVerticalOffset?: number;
};

export function KeyboardSafeView({ enabled = true, keyboardVerticalOffset = 0, style, children, ...rest }: KeyboardSafeViewProps) {
  if (Platform.OS === 'web') {
    return (
      <RNKeyboardAvoidingView style={style} behavior="height" {...rest}>
        {children}
      </RNKeyboardAvoidingView>
    );
  }
  return (
    <ControllerKeyboardAvoidingView
      style={style}
      behavior="padding"
      enabled={enabled}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...rest}
    >
      {children}
    </ControllerKeyboardAvoidingView>
  );
}

/**
 * Props for a `<Modal>` that holds inputs. On Android the keyboard library measures the
 * keyboard against the whole screen, so the Modal has to draw edge to edge. iOS and web
 * ignore both flags, so nothing changes there.
 */
export const KEYBOARD_MODAL_PROPS = { statusBarTranslucent: true, navigationBarTranslucent: true } as const;

/**
 * Android only: the system-bar insets for a Modal drawn edge to edge, so sheet content
 * keeps clear of the status bar and the navigation bar. Zero on iOS and web, where the
 * Modal is not edge to edge.
 */
export function useModalInsets(): { top: number; bottom: number } {
  // The context, not useSafeAreaInsets(): this is null (no padding) when no provider is
  // mounted, so a sheet rendered on its own, or under test, does not throw.
  const insets = useContext(SafeAreaInsetsContext);
  return Platform.OS === 'android' && insets ? { top: insets.top, bottom: insets.bottom } : { top: 0, bottom: 0 };
}
