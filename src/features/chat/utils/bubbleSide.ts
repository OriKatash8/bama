/**
 * Which side of the row a message bubble sits on.
 *
 * Every chat app puts YOUR messages on the side you write towards and the other
 * person's on the side you read from — so in English yours are on the right, and
 * in Hebrew the whole thing mirrors and yours are on the left.
 *
 * Normally the platform does that for free: flipping the layout to RTL turns
 * `flex-end` into the left. This app cannot rely on it. `src/app/_layout.tsx`
 * calls `I18nManager.forceRTL(false)` and `allowRTL(false)`, so the layout is
 * permanently left-to-right and `flex-end` is ALWAYS the right-hand side, in
 * both languages. That is why this reads `rtl` explicitly rather than using
 * `start`/`end`, which are dead aliases for `left`/`right` app-wide.
 *
 * Kept as a pure function rather than a pair of static styles because the
 * answer now depends on the reader's language, and a ternary buried in a
 * 2000-line render is not something anyone can check.
 */
export function bubbleSide(isOwn: boolean, rtl: boolean): 'flex-start' | 'flex-end' {
  // Yours go to the writing end: the right in English, the left in Hebrew.
  // The other person's take the opposite side, whichever that is.
  const ownSide = rtl ? 'flex-start' : 'flex-end';
  const peerSide = rtl ? 'flex-end' : 'flex-start';
  return isOwn ? ownSide : peerSide;
}
