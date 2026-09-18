/**
 * Pure pieces of the client card's carousel, kept out of the component so the
 * two things most likely to break — direction and what happens when the shown
 * professional is resolved — are testable without gestures.
 */

/** Minimum horizontal travel (px) before a drag counts as a swipe. */
export const SWIPE_THRESHOLD = 40;

/**
 * Horizontal travel (px) before the carousel claims the gesture at all. Below
 * it, taps still reach the buttons underneath and vertical drags still scroll
 * the chat.
 */
export const CLAIM_PX = 12;

/** Width of the strip along each screen edge that belongs to the screen. */
export const EDGE_PX = 32;

/**
 * Whether a drag began in the screen's own gesture zone.
 *
 * Paging the card and swiping the screen away are the same motion, and in
 * Hebrew they are even the same direction. The edges stay the screen's: a drag
 * that starts there is left alone, so going back still works. Everywhere else
 * on the card is the carousel's.
 */
export function startedAtEdge(x0: number, screenWidth: number, edge = EDGE_PX): boolean {
  return x0 <= edge || x0 >= screenWidth - edge;
}

/**
 * On the web the browser reads a horizontal drag as "go back in history", and
 * a trackpad swipe as the same. Claiming the axis is what stops it; native
 * platforms have no such style and take null.
 */
export function pageSwipeGuard(platform: string): object | null {
  return platform === 'web' ? { touchAction: 'pan-y', overscrollBehaviorX: 'contain' } : null;
}

/** How long the card takes to leave, and the next one to arrive (ms, each way). */
export const SLIDE_MS = 150;

/**
 * How far the card follows the finger, given where it is in the list.
 *
 * Straight through (the card tracks the finger) while there is somewhere to go.
 * Dragging past the first or the last professional is RESISTED instead of
 * refused: the card still moves, by a fraction, so the gesture answers and the
 * end of the list is felt rather than guessed at.
 */
export function dragOffset(
  dx: number,
  rtl: boolean,
  atStart: boolean,
  atEnd: boolean,
  resist = 4,
): number {
  const towardNext = rtl ? dx > 0 : dx < 0;
  return (towardNext ? atEnd : atStart) ? dx / resist : dx;
}

/**
 * Which way the shown card leaves for a step: -1 off to the left, +1 off to the
 * right. The next one arrives from the opposite edge, so it reads as one strip
 * of cards moving. Mirrored in RTL, exactly as `swipeStep` is.
 */
export function exitSign(step: -1 | 1, rtl: boolean): -1 | 1 {
  return (rtl ? step : -step) as -1 | 1;
}

/**
 * Which way a horizontal swipe moves: +1 next, -1 previous, 0 nothing.
 *
 * LTR: swiping LEFT (dx < 0) brings in the next professional, like turning a page.
 * RTL: mirrored — Hebrew reads right to left, so the next one comes from the left
 * and swiping RIGHT (dx > 0) brings it in.
 */
export function swipeStep(dx: number, rtl: boolean, threshold = SWIPE_THRESHOLD): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold) return 0;
  const towardNext = rtl ? dx > 0 : dx < 0;
  return towardNext ? 1 : -1;
}

/**
 * Which professional to show after the pending list changed.
 *
 * Tracked by id, not by position: if someone EARLIER in the list is resolved,
 * the shown professional stays on screen. If the shown one is resolved himself,
 * the index clamps and the next professional — who has slid into that position —
 * is shown ("advances"); past the end, the new last one.
 */
export function resolveShownIndex(ids: readonly string[], shownId: string | null, lastIndex: number): number {
  if (ids.length === 0) return 0;
  const at = shownId ? ids.indexOf(shownId) : -1;
  if (at !== -1) return at;
  return Math.max(0, Math.min(lastIndex, ids.length - 1));
}

/**
 * A slide, as two positions: where the shown card is carried off to, and which
 * edge the next one comes in from. They are always opposite, which is what
 * makes the two cards read as one strip moving rather than a cut.
 */
export function slidePlan(step: -1 | 1, rtl: boolean, width: number): { out: number; from: number } {
  const out = exitSign(step, rtl) * width;
  return { out, from: -out };
}

/** What a gesture gives us. Structural, so this file stays free of React Native. */
type Gesture = { dx: number; dy: number; moveX: number };

/**
 * Where the finger went down, worked back from where it is now.
 *
 * `gestureState.x0` would say the same thing, but it is only filled in once the
 * responder has been GRANTED — while the claim is still being decided it reads
 * 0, which put every drag on the left edge and refused the lot.
 */
export function dragStartX(g: { moveX: number; dx: number }): number {
  return g.moveX - g.dx;
}

/**
 * The carousel's gesture, as plain callbacks: claim clearly horizontal drags,
 * move the card with the finger, and on release either carry it the rest of the
 * way or let it fall back.
 *
 * Kept out of the component so the gesture can be exercised without a touch
 * system — the alternative is a PanResponder nobody can test.
 */
export function carouselPanConfig(o: {
  /** True while a slide is already playing; the gesture keeps out of its way. */
  locked: () => boolean;
  rtl: () => boolean;
  ends: () => { atStart: boolean; atEnd: boolean };
  /** Screen width, for leaving the edges to the screen's own gesture. */
  screenWidth: () => number;
  onDrag: (x: number) => void;
  onStep: (step: -1 | 1) => void;
  onSettle: () => void;
}) {
  return {
    onMoveShouldSetPanResponder: (_e: unknown, g: Gesture) =>
      !o.locked()
      && !startedAtEdge(dragStartX(g), o.screenWidth())
      && Math.abs(g.dx) > CLAIM_PX && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    // Once the card has the drag it keeps it: handing it back mid-swipe is how
    // one motion ends up moving both the card and the screen.
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e: unknown, g: Gesture) => {
      if (o.locked()) return;
      const { atStart, atEnd } = o.ends();
      o.onDrag(dragOffset(g.dx, o.rtl(), atStart, atEnd));
    },
    onPanResponderRelease: (_e: unknown, g: Gesture) => {
      // A finger lifted during a slide must not yank the card back to the
      // middle of an animation that is already carrying it somewhere.
      if (o.locked()) return;
      const step = swipeStep(g.dx, o.rtl());
      if (step === 0) o.onSettle();
      else o.onStep(step);
    },
    // Lost the gesture (a parent scroll took over): put the card back.
    onPanResponderTerminate: () => { if (!o.locked()) o.onSettle(); },
  };
}
