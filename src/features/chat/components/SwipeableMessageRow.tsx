import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Reply } from 'lucide-react-native';
import { replyPanConfig, REPLY_MAX_DRAG } from '../utils/replySwipe';
import { pageSwipeGuard } from '../utils/swipeGeometry';

/**
 * A message row that can be swiped to reply.
 *
 * The direction, the thresholds and the edge exclusion all live in
 * utils/replySwipe.ts, so what is left here is the animation and the two entry
 * points.
 *
 * LONG-PRESS is not a nicety. A mouse cannot swipe, so without it the feature
 * does not exist on the web — which is where most of this app is reviewed — and
 * there would be no way to reply with a keyboard or a screen reader either. It
 * is a Pressable with no `onPress`, so an ordinary tap still falls through to
 * whatever is inside the bubble: opening a photo, scrubbing a voice note,
 * tapping a mention.
 *
 * The row is NOT wrapped when it cannot be replied to — system notices, the
 * shared listing card, date separators. A disabled Pressable around them would
 * still sit between the bubble and the list for no reason.
 */
export function SwipeableMessageRow({
  enabled, rtl, accent, onReply, style, children,
}: {
  enabled: boolean;
  rtl: boolean;
  accent: string;
  onReply: () => void;
  style?: object;
  children: React.ReactNode;
}) {
  const { width } = useWindowDimensions();
  // useState with a lazy initializer rather than useRef(...).current: the value
  // is created once either way, and this one is not a ref being read during
  // render, which is what the Animated idiom otherwise trips over.
  const [translateX] = useState(() => new Animated.Value(0));

  /**
   * The responder is created ONCE and reads everything through getters.
   *
   * It cannot be rebuilt per render: `onReply` is an inline arrow from the
   * list's renderItem, so a PanResponder keyed on it would be replaced on every
   * render — and PanResponder keeps its gestureState in the closure it was
   * created with, so an in-flight drag would lose its own history mid-swipe.
   *
   * The ref is written in an EFFECT rather than during render, and only stable
   * callbacks are handed to the config.
   *
   * react-hooks/refs still flags the useMemo below, because it traces those
   * callbacks back to the ref they close over. It is a false positive here —
   * PanResponder.create only stores them — and it is the same error, for the
   * same reason, that VoiceMessageBubble's scrubber already carries in
   * ChatRoomScreen. Every alternative tried was worse: useState with a lazy
   * initializer adds a warning on top of it, and keying the useMemo on onReply
   * reintroduces the mid-drag rebuild this comment exists to prevent.
   */
  const latest = useRef({ enabled, rtl, onReply, width });
  useEffect(() => { latest.current = { enabled, rtl, onReply, width }; });

  const getEnabled = useCallback(() => latest.current.enabled, []);
  const getRtl = useCallback(() => latest.current.rtl, []);
  const getWidth = useCallback(() => latest.current.width, []);
  const fireReply = useCallback(() => latest.current.onReply(), []);
  const drag = useCallback((x: number) => translateX.setValue(x), [translateX]);
  const settle = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20,
    }).start();
  }, [translateX]);

  const pan = useMemo(
    () => PanResponder.create(replyPanConfig({
      enabled: getEnabled,
      rtl: getRtl,
      screenWidth: getWidth,
      onDrag: drag,
      onReply: fireReply,
      onSettle: settle,
    })),
    [getEnabled, getRtl, getWidth, drag, fireReply, settle],
  );

  return (
    <Pressable
      testID="message-row"
      accessibilityHint={enabled ? 'Hold to reply to this message' : undefined}
      // No onPress: a tap has to keep reaching the bubble's own touchables.
      onLongPress={enabled ? onReply : undefined}
      delayLongPress={400}
      style={[
        styles.row,
        // Without this the browser reads a horizontal drag as "go back in
        // history" and leaves the chat halfway through a reply.
        Platform.OS === 'web' ? pageSwipeGuard('web') : null,
        style,
      ]}
      {...(enabled ? pan.panHandlers : {})}
    >
      {/* The icon sits under the row and is uncovered as it slides, so the
          gesture explains itself the first time rather than after it fires. */}
      {enabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.hint,
            rtl ? { right: 0 } : { left: 0 },
            {
              opacity: translateX.interpolate({
                inputRange: rtl ? [-REPLY_MAX_DRAG, 0] : [0, REPLY_MAX_DRAG],
                outputRange: rtl ? [1, 0] : [0, 1],
                extrapolate: 'clamp',
              }),
            },
          ]}
        >
          <Reply size={18} color={accent} strokeWidth={2} />
        </Animated.View>
      )}
      <Animated.View style={{ transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { justifyContent: 'center' },
  hint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
