import { CLAIM_PX, startedAtEdge, dragStartX } from './swipeGeometry';

/**
 * Swipe a message to reply to it, as plain callbacks.
 *
 * Kept out of the component so the gesture can be exercised without a touch
 * system — the alternative is a PanResponder nobody can test. Same shape and
 * the same reasoning as carouselPanConfig next door, and it borrows that file's
 * hard-won geometry rather than repeating it.
 *
 * THE DIRECTION IS THE WHOLE PROBLEM. The app is layout-LTR-locked
 * (I18nManager.forceRTL(false) in src/app/_layout.tsx), so the screen's own
 * swipe-back always starts at the LEFT edge going right — in Hebrew as much as
 * in English. Mirroring the reply swipe by language, the way WhatsApp does,
 * therefore puts ENGLISH in direct competition with it:
 *
 *   English   [ message ]──→        back gesture ──→   same motion
 *   Hebrew    ←──[ הודעה ]          back gesture ──→   opposite
 *
 * Two things keep them apart, and both are needed:
 *
 *  1. The edge strip below, which refuses any drag starting near a screen edge.
 *  2. The chat screen pinning the back gesture to that edge — it sets
 *     `fullScreenGestureEnabled: false` and `gestureResponseDistance: 24`,
 *     because on iOS 26+ the back gesture otherwise spans the WHOLE screen and
 *     no edge exclusion could save the row.
 *
 * 24 < EDGE_PX(32) on purpose: the two zones are disjoint by construction, so
 * neither has to be switched off while the other is live. That is why there is
 * no "a row is being swiped" flag anywhere — lifting one would re-render the
 * chat screen, and every visible row with it, in the exact frames the drag
 * needs.
 */

/** Travel (px) before the row claims the gesture. Shared with the carousel. */
export const REPLY_CLAIM_PX = CLAIM_PX;

/**
 * Travel (px) before a release actually replies.
 *
 * Higher than the carousel's 40 because this commits to an action — it fills
 * the composer and takes the keyboard — where paging a card is undoable by
 * swiping back the other way.
 */
export const REPLY_THRESHOLD = 56;

/** How far the row will travel. Past this it resists rather than follows. */
export const REPLY_MAX_DRAG = 72;

/** How much of the overshoot still shows, so the end of the travel is felt. */
const OVERSHOOT_RESIST = 4;

/**
 * Is this drag going the way a reply goes?
 *
 * English drags the row RIGHT, Hebrew drags it LEFT — mirrored by language,
 * exactly as `swipeStep` mirrors the carousel. A motionless finger is neither.
 */
export function towardReply(dx: number, rtl: boolean): boolean {
  return rtl ? dx < 0 : dx > 0;
}

/**
 * How far the row follows the finger.
 *
 * Zero in the wrong direction — the row must not drift toward the back gesture
 * — and resisted past REPLY_MAX_DRAG so the travel has an end that can be felt
 * rather than a row that slides off the screen.
 */
export function replyOffset(dx: number, rtl: boolean): number {
  if (!towardReply(dx, rtl)) return 0;
  const travel = Math.abs(dx);
  const capped = travel <= REPLY_MAX_DRAG
    ? travel
    : REPLY_MAX_DRAG + (travel - REPLY_MAX_DRAG) / OVERSHOOT_RESIST;
  return rtl ? -capped : capped;
}

/** Did this release go far enough, the right way, to reply? */
export function replyTriggered(dx: number, rtl: boolean): boolean {
  return towardReply(dx, rtl) && Math.abs(dx) >= REPLY_THRESHOLD;
}

/** What a gesture gives us. Structural, so this file stays free of React Native. */
type Gesture = { dx: number; dy: number; moveX: number };

export function replyPanConfig(o: {
  /** False for rows that cannot be replied to, and while the composer is gone. */
  enabled: () => boolean;
  rtl: () => boolean;
  /** Screen width, for leaving the edges to the screen's own gesture. */
  screenWidth: () => number;
  onDrag: (x: number) => void;
  onReply: () => void;
  onSettle: () => void;
}) {
  return {
    onMoveShouldSetPanResponder: (_e: unknown, g: Gesture) =>
      o.enabled()
      && towardReply(g.dx, o.rtl())
      && !startedAtEdge(dragStartX(g), o.screenWidth())
      && Math.abs(g.dx) > REPLY_CLAIM_PX && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    // Once the row has the drag it keeps it: handing it back mid-swipe is how
    // one motion ends up moving both the row and the screen.
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e: unknown, g: Gesture) => {
      o.onDrag(replyOffset(g.dx, o.rtl()));
    },
    onPanResponderRelease: (_e: unknown, g: Gesture) => {
      // The row springs back either way — the reply shows in the composer, not
      // by leaving the message displaced.
      o.onSettle();
      if (replyTriggered(g.dx, o.rtl())) o.onReply();
    },
    // Lost the gesture (the list took over): put the row back.
    onPanResponderTerminate: () => { o.onSettle(); },
  };
}
