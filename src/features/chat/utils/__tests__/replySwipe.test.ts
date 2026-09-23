import {
  REPLY_CLAIM_PX, REPLY_THRESHOLD, REPLY_MAX_DRAG,
  towardReply, replyOffset, replyTriggered, replyPanConfig,
} from '../replySwipe';
import { EDGE_PX } from '../swipeGeometry';

/**
 * Swipe-to-reply, as pure functions.
 *
 * The whole feature turns on ONE fact: the app is layout-LTR-locked
 * (I18nManager.forceRTL(false)), so the iOS back gesture always starts at the
 * LEFT edge going right — in Hebrew as well as English. The reply swipe mirrors
 * by language, which means in ENGLISH it is the same motion as swiping the
 * screen away. Nothing below is cosmetic: the direction, the edge strip, and the
 * claim threshold are the three things standing between a reply and the user
 * accidentally leaving the chat.
 *
 * Kept out of the component so the gesture can be exercised without a touch
 * system — the alternative is a PanResponder nobody can test. Same reasoning,
 * and same shape, as carousel.ts next door.
 */

const SCREEN = 400;
/** A gesture as PanResponder reports it. moveX is absolute, dx is relative. */
const g = (dx: number, dy = 0, startX = SCREEN / 2) => ({ dx, dy, moveX: startX + dx });

describe('which way a reply swipe goes', () => {
  it('drags RIGHT in English', () => {
    expect(towardReply(30, false)).toBe(true);
    expect(towardReply(-30, false)).toBe(false);
  });

  it('drags LEFT in Hebrew — mirrored, like the carousel', () => {
    expect(towardReply(-30, true)).toBe(true);
    expect(towardReply(30, true)).toBe(false);
  });

  it('is not triggered by a standing-still finger', () => {
    expect(towardReply(0, false)).toBe(false);
    expect(towardReply(0, true)).toBe(false);
  });
});

describe('how far the row follows the finger', () => {
  it('tracks the finger up to the cap', () => {
    expect(replyOffset(40, false)).toBe(40);
    expect(replyOffset(-40, true)).toBe(-40);
  });

  it('RESISTS past the cap rather than refusing — the row still answers', () => {
    const far = replyOffset(REPLY_MAX_DRAG + 100, false);
    expect(far).toBeGreaterThan(REPLY_MAX_DRAG);
    expect(far).toBeLessThan(REPLY_MAX_DRAG + 100);
  });

  it('does not move AT ALL in the wrong direction', () => {
    // The anchor for this group. Without it, "return dx" passes everything
    // above, and the row would slide toward the back gesture in English.
    expect(replyOffset(-60, false)).toBe(0);
    expect(replyOffset(60, true)).toBe(0);
  });

  it('keeps the sign of the language it is in', () => {
    expect(replyOffset(50, false)).toBeGreaterThan(0);
    expect(replyOffset(-50, true)).toBeLessThan(0);
  });
});

describe('when the reply actually fires', () => {
  it('fires past the threshold, in the right direction', () => {
    expect(replyTriggered(REPLY_THRESHOLD + 1, false)).toBe(true);
    expect(replyTriggered(-(REPLY_THRESHOLD + 1), true)).toBe(true);
  });

  it('does not fire on a short drag', () => {
    expect(replyTriggered(REPLY_THRESHOLD - 1, false)).toBe(false);
    expect(replyTriggered(-(REPLY_THRESHOLD - 1), true)).toBe(false);
  });

  it('NEVER fires in the wrong direction, however far', () => {
    // The anchor: a long drag the other way is someone swiping the screen away.
    expect(replyTriggered(-500, false)).toBe(false);
    expect(replyTriggered(500, true)).toBe(false);
  });

  it('needs more travel than the carousel, because it commits to an action', () => {
    expect(REPLY_THRESHOLD).toBeGreaterThan(40);
  });
});

describe('claiming the gesture — what the screen keeps', () => {
  const config = (over: Partial<Parameters<typeof replyPanConfig>[0]> = {}) => replyPanConfig({
    enabled: () => true,
    rtl: () => false,
    screenWidth: () => SCREEN,
    onDrag: () => {},
    onReply: () => {},
    onSettle: () => {},
    ...over,
  });
  const claims = (c: ReturnType<typeof replyPanConfig>, gesture: ReturnType<typeof g>) =>
    c.onMoveShouldSetPanResponder({}, gesture);

  it('claims a clear horizontal drag from the middle', () => {
    expect(claims(config(), g(REPLY_CLAIM_PX + 5))).toBe(true);
  });

  it('leaves the EDGES to the screen, so swipe-back still works', () => {
    // A drag starting inside the edge strip belongs to the screen's own back
    // gesture. This is the clause that keeps one motion from doing two things.
    expect(claims(config(), g(30, 0, EDGE_PX - 1))).toBe(false);
    expect(claims(config(), g(-30, 0, SCREEN - EDGE_PX + 1))).toBe(false);
  });

  it('reads the start from moveX - dx, not from a not-yet-granted x0', () => {
    // gestureState.x0 reads 0 before the responder is granted, which would put
    // every drag on the left edge and refuse the lot. Same trap as the carousel.
    const startedMiddle = g(40, 0, SCREEN / 2);
    expect(startedMiddle.moveX - startedMiddle.dx).toBe(SCREEN / 2);
    expect(claims(config(), startedMiddle)).toBe(true);
  });

  it('does not claim below the travel threshold, so taps still land', () => {
    expect(claims(config(), g(REPLY_CLAIM_PX - 1))).toBe(false);
  });

  it('lets a mostly-VERTICAL drag scroll the list', () => {
    expect(claims(config(), g(20, 40))).toBe(false);
  });

  it('does not claim a drag in the wrong direction at all', () => {
    // Otherwise an English left-drag would be swallowed here and the list
    // would stop scrolling sideways for no visible reason.
    expect(claims(config(), g(-(REPLY_CLAIM_PX + 20)))).toBe(false);
  });

  it('keeps out of the way when the row is not repliable', () => {
    expect(claims(config({ enabled: () => false }), g(REPLY_CLAIM_PX + 20))).toBe(false);
  });

  it('claims a LEFT drag in Hebrew and refuses a right one', () => {
    const he = config({ rtl: () => true });
    expect(claims(he, g(-(REPLY_CLAIM_PX + 20)))).toBe(true);
    expect(claims(he, g(REPLY_CLAIM_PX + 20))).toBe(false);
  });

  it('never hands the drag back mid-swipe', () => {
    // Handing it back is how one motion ends up moving the row AND the screen.
    expect(config().onPanResponderTerminationRequest()).toBe(false);
  });
});

describe('what release does', () => {
  const run = (dx: number, rtl = false) => {
    const calls: string[] = [];
    const c = replyPanConfig({
      enabled: () => true,
      rtl: () => rtl,
      screenWidth: () => SCREEN,
      onDrag: () => {},
      onReply: () => calls.push('reply'),
      onSettle: () => calls.push('settle'),
    });
    c.onPanResponderRelease({}, g(dx));
    return calls;
  };

  it('replies on a long enough drag — and still springs the row back', () => {
    // The reply shows in the COMPOSER, so leaving the message displaced would
    // be a second, permanent piece of UI saying the same thing.
    expect(run(REPLY_THRESHOLD + 10)).toEqual(['settle', 'reply']);
  });

  it('springs back on a short one, without replying', () => {
    expect(run(REPLY_THRESHOLD - 10)).toEqual(['settle']);
  });

  it('springs back on a wrong-direction drag', () => {
    expect(run(-(REPLY_THRESHOLD + 50))).toEqual(['settle']);
  });

  it('puts the row back when the list steals the gesture', () => {
    const calls: string[] = [];
    replyPanConfig({
      enabled: () => true, rtl: () => false, screenWidth: () => SCREEN,
      onDrag: () => {}, onReply: () => {}, onSettle: () => calls.push('settle'),
    }).onPanResponderTerminate();
    expect(calls).toEqual(['settle']);
  });
});

describe('move', () => {
  it('reports the offset, not the raw dx', () => {
    const seen: number[] = [];
    const c = replyPanConfig({
      enabled: () => true, rtl: () => false, screenWidth: () => SCREEN,
      onDrag: (x) => seen.push(x), onReply: () => {}, onSettle: () => {},
    });
    c.onPanResponderMove({}, g(REPLY_MAX_DRAG + 100));
    expect(seen[0]).toBeLessThan(REPLY_MAX_DRAG + 100);
    expect(seen[0]).toBeGreaterThan(REPLY_MAX_DRAG);
  });

  it('reports nothing but zero for a wrong-direction drag', () => {
    const seen: number[] = [];
    const c = replyPanConfig({
      enabled: () => true, rtl: () => false, screenWidth: () => SCREEN,
      onDrag: (x) => seen.push(x), onReply: () => {}, onSettle: () => {},
    });
    c.onPanResponderMove({}, g(-80));
    expect(seen).toEqual([0]);
  });
});
