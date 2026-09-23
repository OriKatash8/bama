/**
 * Geometry shared by every horizontal drag inside a chat.
 *
 * Two of them exist now — paging the candidate carousel and swiping a message
 * to reply — and both sit inside the chat room, both compete with the screen's
 * own swipe-back, and both are laid out LTR whatever the language. They agree
 * on where a drag starts, which strip of the screen is not theirs, and how the
 * web browser is stopped from reading a horizontal drag as "go back".
 *
 * This lived in components/candidates/carousel.ts first. It moved here rather
 * than being copied, because `dragStartX` in particular encodes a fact about
 * PanResponder that cost real time to find, and a second copy is exactly the
 * kind of thing that drifts.
 */

/**
 * Horizontal travel (px) before a row claims the gesture at all. Below it, taps
 * still reach anything underneath and vertical drags still scroll the list.
 */
export const CLAIM_PX = 12;

/** Width of the strip along each screen edge that belongs to the screen. */
export const EDGE_PX = 32;

/**
 * Whether a drag began in the screen's own gesture zone.
 *
 * Dragging a row and swiping the screen away are the same motion, and in one
 * language or the other they are the same direction too. The edges stay the
 * screen's: a drag that starts there is left alone, so going back still works.
 * Everywhere else belongs to the row.
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
