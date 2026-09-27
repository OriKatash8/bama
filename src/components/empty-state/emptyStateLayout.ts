/**
 * Layout data for AnimatedEmptyState's floating cards. Pure, so it is tested
 * without rendering. Positions are on a 390pt reference width; `left` scales to
 * the real width, `top` is relative to the illustration panel and does not.
 */

export const REFERENCE_WIDTH = 390;

/** Real RoleDef ids (src/features/crew/data/categories.ts). */
export type RoleId = string;

/** video, stills photography, editing, sound, lighting, design. */
export const DEFAULT_ROLES: RoleId[] = ['videographer', 'photographer', 'editor', 'sound', 'lighting', 'graphic_designer'];

export type Placement = { left: number; top: number; rotate: number };

/** Tiles / board cards, back to front: editing renders ABOVE sound, overlapping it. */
export const TILE_LAYOUT: (Placement & { role: RoleId })[] = [
  { role: 'videographer', left: 226, top: 22, rotate: -4 },
  { role: 'photographer', left: -14, top: 64, rotate: 5 },
  { role: 'sound', left: 196, top: 158, rotate: -2 },
  { role: 'editor', left: 92, top: 136, rotate: 3 },
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
