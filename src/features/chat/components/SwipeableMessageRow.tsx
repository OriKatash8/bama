import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
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
 * THE SHAPE OF THIS COMPONENT IS LOAD-BEARING, and the first version got it
 * wrong in two ways that shipped together. Both are pinned by
 * SwipeableMessageRowLayout.test.tsx.
 *
 * 1. The caller's style goes on the box that DIRECTLY PARENTS the children.
 *    `styles.bubble` is `maxWidth: '75%'` and `styles.mediaBubble` is
 *    `width: '75%'`, and a percentage resolves against its parent's width. The
 *    first version put the caller's `bubbleWrapper` on the outer node and slid
 *    an unstyled `Animated.View` in between, so both percentages began
 *    resolving against a box that was itself sized by the very content they
 *    were supposed to bound. Every bubble in every chat was clipped.
 *
 * 2. The pan handlers and the long-press live on DIFFERENT nodes. Pressable
 *    renders `<View {...restProps} {...pressabilityHandlers}>`, so spreading
 *    panHandlers onto one silently replaces onResponderGrant, onResponderMove,
 *    onResponderRelease, onResponderTerminate and onResponderTerminationRequest
 *    with Pressability's. Only onMoveShouldSetResponder survives — so the row
 *    claims the touch and then nothing happens, which looks exactly like the
 *    list stealing the gesture. The handlers are on the plain outer View here;
 *    only the long-press is on a Pressable.
 *
 * Neither extra node changes layout: the outer is a default column box, so its
 * child stretches to full width, and the animated Pressable inside it is the
 * caller's row exactly as it was before this component existed.
 */

// Module scope. Created inside the component, this would remount the row — and
// every bubble in it — on each render.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  /**
   * TEMPORARY. Remove once the swipe is confirmed on a device.
   *
   * Prints three lines per gesture at most — claim, grant, release — plus
   * TERMINATED if something takes the responder away. Silence means the row was
   * never offered the gesture at all, which is a different problem from being
   * offered it and losing it.
   */
  const trace = useCallback((name: string, info?: Record<string, unknown>) => {
    if (__DEV__) console.log(`[reply-swipe] ${name}`, info ?? '');
  }, []);

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
      onEvent: trace,
    })),
    [getEnabled, getRtl, getWidth, drag, fireReply, settle, trace],
  );

  return (
    <View
      testID="message-row"
      style={[
        // Without this the browser reads a horizontal drag as "go back in
        // history" and leaves the chat halfway through a reply.
        Platform.OS === 'web' ? pageSwipeGuard('web') : null,
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
      {/* The caller's row, unchanged — this is the bubble's OWN parent, and the
          box both '75%' widths measure against. No onPress: a tap has to keep
          reaching the photo, the voice scrubber and the mentions underneath. */}
      <AnimatedPressable
        testID="message-row-press"
        accessibilityHint={enabled ? 'Hold to reply to this message' : undefined}
        onLongPress={enabled ? onReply : undefined}
        delayLongPress={400}
        style={[style, { transform: [{ translateX }] }]}
      >
        {children}
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
