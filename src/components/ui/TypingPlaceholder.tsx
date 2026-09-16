import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * A placeholder that types out example answers on a loop, drawn BEHIND an input
 * that has no placeholder of its own. It runs until the field is touched, and
 * then never again — that latch is what keeps it from animating under someone
 * who is trying to read or write.
 *
 * It is a separate leaf component on purpose. RN's `placeholder` prop takes a
 * string, so animating it means re-rendering the TextInput once per character —
 * about thirty times per example, on a screen that also holds a FlatList of role
 * tiles. Owning the per-character state down here means nothing above it
 * re-renders. (Reanimated cannot help: you cannot animate a Text's children, and
 * the usual trick for animated text needs a second TextInput, which is the thing
 * being avoided.)
 */

/** Per character. */
export const TYPE_MS = 35;
/** How long a finished example sits before the next one starts. */
export const HOLD_MS = 1200;

type Props = {
  /** Typed in order, once. */
  examples: readonly string[];
  /** Shown instead once typing has stopped for good. */
  fallback: string;
  rtl: boolean;
  /**
   * The field has focus or content. Latched: once this has been true the typing
   * never resumes, so clearing the field does not restart it mid-thought.
   */
  stopped: boolean;
  /** The field has text of its own, so no placeholder belongs on screen. */
  hidden: boolean;
  style?: StyleProp<TextStyle>;
};

export function TypingPlaceholder({ examples, fallback, rtl, stopped, hidden, style }: Props) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState('');
  const latched = useRef(false);
  if (stopped) latched.current = true;

  const frozen = latched.current || reduceMotion || hidden;

  useEffect(() => {
    if (frozen) return;

    let timer: ReturnType<typeof setTimeout>;
    let example = 0;
    let chars = 0;

    const tick = () => {
      const target = examples[example] ?? '';
      if (chars < target.length) {
        chars += 1;
        setShown(target.slice(0, chars));
        timer = setTimeout(tick, TYPE_MS);
        return;
      }
      // Loops. It only ever stops because the field was touched — see `latched`,
      // which is the guard against a field that animates under someone who is
      // trying to read it.
      example = (example + 1) % examples.length;
      chars = 0;
      timer = setTimeout(tick, HOLD_MS);
    };

    timer = setTimeout(tick, TYPE_MS);
    return () => clearTimeout(timer);
  }, [frozen, examples]);

  if (hidden) return null;

  const text = latched.current ? fallback : reduceMotion ? (examples[0] ?? '') : shown;
  const typing = !latched.current && !reduceMotion;

  return (
    <Text
      testID="typing-placeholder"
      numberOfLines={4}
      pointerEvents="none"
      style={[
        styles.text,
        { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' },
        style,
      ]}
    >
      <Text testID="typing-text">{text}</Text>
      {typing ? <Text testID="typing-caret">|</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  // Behind the input, which is transparent to touches it does not want.
  text: { position: 'absolute', left: 0, right: 0, top: 0 },
});
