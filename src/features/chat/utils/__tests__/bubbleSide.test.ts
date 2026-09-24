import { bubbleSide } from '../bubbleSide';

/**
 * Which side a bubble sits on, in each language.
 *
 * The app is layout-LTR-locked — `I18nManager.forceRTL(false)` — so nothing
 * mirrors on its own and `flex-end` means the right-hand side in Hebrew exactly
 * as it does in English. Every case below is therefore about a real screen
 * position, not a writing-direction alias.
 */

describe('English, which reads left to right', () => {
  it('puts your own messages on the right', () => {
    expect(bubbleSide(true, false)).toBe('flex-end');
  });

  it('puts the other person on the left', () => {
    expect(bubbleSide(false, false)).toBe('flex-start');
  });
});

describe('Hebrew, which mirrors', () => {
  it('puts your own messages on the LEFT', () => {
    expect(bubbleSide(true, true)).toBe('flex-start');
  });

  it('puts the other person on the right', () => {
    expect(bubbleSide(false, true)).toBe('flex-end');
  });
});

describe('the two properties that make it a mirror and not a muddle', () => {
  it('never puts both people on the same side', () => {
    // The anchor. Without it, "always flex-start" satisfies half the cases
    // above and collapses every conversation into one column.
    for (const rtl of [true, false]) {
      expect(bubbleSide(true, rtl)).not.toBe(bubbleSide(false, rtl));
    }
  });

  it('is an exact mirror: switching language swaps both sides', () => {
    // The other anchor. A change that moved only YOUR messages would leave both
    // people on the same side in one of the two languages.
    for (const isOwn of [true, false]) {
      expect(bubbleSide(isOwn, true)).not.toBe(bubbleSide(isOwn, false));
    }
  });

  it('only ever returns a real side', () => {
    for (const isOwn of [true, false]) {
      for (const rtl of [true, false]) {
        expect(['flex-start', 'flex-end']).toContain(bubbleSide(isOwn, rtl));
      }
    }
  });
});
