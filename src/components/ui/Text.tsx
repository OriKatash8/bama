import { createContext, forwardRef, useContext, type ComponentProps } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextStyle } from 'react-native';
import { useSettingsStore } from '@core/stores/settingsStore';
import { extractText } from '@core/theme/extractText';
import { resolveTextStyle } from '@core/theme/fonts';

/**
 * Drop-in `Text` / `TextInput` that always render in the app's fonts.
 *
 * The app used to set `Text.defaultProps` / `TextInput.defaultProps` at startup
 * for this. React 19 ignores `defaultProps` on function components, so it did
 * nothing, and every plain `<Text>` fell back to the system font (SF on iOS,
 * Roboto on Android). These apply the default for real: the face for the text's
 * script (Heebo for Hebrew, Montserrat otherwise — the same rule as AppText),
 * and any `fontWeight` in the style is turned into the matching static family
 * (see src/core/theme/fonts.ts) so Android never synthesizes bold.
 *
 * Use these instead of react-native's. AppText is still the choice when a
 * component wants a named weight.
 */

/** A `Text` inside another `Text` inherits the parent's face unless it sets its own. */
const InsideText = createContext(false);

export const Text = forwardRef<RNText, ComponentProps<typeof RNText>>(function Text({ style, children, ...rest }, ref) {
  const inside = useContext(InsideText);
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const own = flat.fontFamily !== undefined || flat.fontWeight !== undefined;
  const resolved = inside && !own ? undefined : resolveTextStyle(flat, extractText(children));
  return (
    <InsideText.Provider value>
      <RNText ref={ref} style={[style, resolved]} {...rest}>{children}</RNText>
    </InsideText.Provider>
  );
});

export const TextInput = forwardRef<RNTextInput, ComponentProps<typeof RNTextInput>>(function TextInput({ style, ...rest }, ref) {
  const hebrewUi = useSettingsStore((s) => s.language) === 'he';
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  // What will be typed is unknown. In Hebrew UI use Heebo, which has Latin as well as
  // Hebrew; otherwise read the script off the value or placeholder.
  const sample = hebrewUi ? 'א' : String(rest.value ?? rest.defaultValue ?? rest.placeholder ?? '');
  return <RNTextInput ref={ref} style={[style, resolveTextStyle(flat, sample)]} {...rest} />;
});
