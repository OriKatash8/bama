/**
 * Layout data for AnimatedEmptyState's floating cards. Pure, so it is tested
 * without rendering. Positions are on a 390pt reference width; `left` scales to
 * the real width, `top` is relative to the illustration panel and does not.
 */

import type { MarketCategoryId } from '@features/marketplace/data/categories';

export type { MarketCategoryId };

export const REFERENCE_WIDTH = 390;

/** Real RoleDef ids (src/features/crew/data/categories.ts). */
export type RoleId = string;

/** video, stills photography, editing, sound, lighting, design. */
export const DEFAULT_ROLES: RoleId[] = ['videographer', 'photographer', 'editor', 'sound', 'lighting', 'graphic_designer'];

export type Placement = { left: number; top: number; rotate: number };

/** Tiles / board cards, back to front. */
export const TILE_LAYOUT: (Placement & { role: RoleId })[] = [
  { role: 'videographer', left: 226, top: 22, rotate: -4 },
  { role: 'photographer', left: -14, top: 64, rotate: 5 },
  { role: 'sound', left: 196, top: 158, rotate: -2 },
  // Moved left, clear of sound even tilted and floating (it used to sit on it);
  // it now just tucks slightly under photography above and lighting below.
  { role: 'editor', left: 38, top: 162, rotate: 3 },
  { role: 'lighting', left: -12, top: 262, rotate: -5 },
  { role: 'graphic_designer', left: 236, top: 284, rotate: 6 },
];

export const BUBBLE_LAYOUT: Placement[] = [
  { left: 200, top: 26, rotate: -3 },
  { left: -22, top: 82, rotate: 4 },
  { left: 62, top: 168, rotate: 2 },
  { left: 190, top: 196, rotate: -1 },
  { left: -18, top: 290, rotate: -4 },
  { left: 214, top: 312, rotate: 5 },
];

/** The first five categories of the marketplace's category row. */
export const DEFAULT_MARKET_CATEGORIES: MarketCategoryId[] = ['camera', 'lens', 'audio', 'lighting', 'drone'];

/** Listing cards, back to front: audio last, so it draws in front, in the centre. */
/** Every card sits 12pt lower than first specced: the tilted, floating camera
 *  card used to rise above the panel's top edge, which cut it off. */
export const LISTING_LAYOUT: (Placement & { category: MarketCategoryId })[] = [
  { category: 'camera', left: 262, top: 16, rotate: -6 },
  { category: 'lens', left: -16, top: 28, rotate: 6 },
  { category: 'lighting', left: 238, top: 130, rotate: 4 },
  { category: 'drone', left: 8, top: 136, rotate: -4 },
  { category: 'audio', left: 128, top: 70, rotate: -2 },
];

/**
 * The listings illustration's height. It sits under the marketplace's search
 * and category row, so it is shorter than the others; its tops are used as
 * they are, not scaled against ILLUSTRATION_HEIGHT.
 */
export const LISTINGS_ILLUSTRATION_HEIGHT = 262;

export function scaleLeft(left: number, width: number): number {
  return (left * width) / REFERENCE_WIDTH;
}

/**
 * Idle float for card `index`. Even cards drift up and right and tilt one way;
 * odd cards drift less up and left and tilt the other. Durations spread over
 * 4.1–5.7s and every card starts at its own phase, so nothing moves in lockstep.
 */
export function floatFor(index: number) {
  const even = index % 2 === 0;
  const DURATIONS = [4100, 5300, 4700, 5700, 4400, 5000];
  return {
    dy: even ? -8 : -6,
    dx: even ? 2 : -3,
    dRotate: even ? 1.3 : -1.2,
    duration: DURATIONS[index % DURATIONS.length],
    /** Where in the 0→1 swing the card starts. */
    phase: ((index * 0.37) % 1 + 0.08) % 1,
  };
}

/**
 * The panel's minimum height so it reaches the bottom of the screen from where it
 * actually sits (`top` = its y in the window). Never negative.
 */
export function fillToBottom(windowHeight: number, top: number): number {
  return Math.max(0, windowHeight - top);
}

/**
 * A title size that fits `text` on ONE line in `available` points, for the
 * English (Montserrat 800) title: 26pt when it already fits, never below 14.
 * An estimate from the average glyph width (~0.62em at 800), so it works on
 * web too, where adjustsFontSizeToFit does nothing; on native that prop
 * fine-tunes from here.
 */
export function fitTitleSize(text: string, available: number, max = 26, min = 14): number {
  const fit = Math.floor(available / (Math.max(1, text.length) * 0.62));
  return Math.max(min, Math.min(max, fit));
}

/** The illustration's full height; card tops are laid out against it. */
export const ILLUSTRATION_HEIGHT = 420;
/** Below this the cards (≈105pt tall) start to pile on each other. */
export const MIN_ILLUSTRATION_HEIGHT = 300;

/**
 * How tall the illustration can be so the text block (title, subtitle, CTA,
 * link) shows without scrolling: the room between where the panel starts and the
 * tab bar, less the text. Full height when it fits or before anything is
 * measured; never below MIN_ILLUSTRATION_HEIGHT.
 */
export function illustrationHeightFor(m: {
  windowHeight: number;
  panelTop: number | null;
  textHeight: number | null;
  bottomInset: number;
}): number {
  if (m.panelTop === null || m.textHeight === null) return ILLUSTRATION_HEIGHT;
  const room = m.windowHeight - m.panelTop - m.textHeight - m.bottomInset;
  return Math.max(MIN_ILLUSTRATION_HEIGHT, Math.min(ILLUSTRATION_HEIGHT, Math.floor(room)));
}

/** A card's top in an illustration of `height` (tops are specced against 420). */
export function scaleTop(top: number, height: number): number {
  return (top * height) / ILLUSTRATION_HEIGHT;
}
