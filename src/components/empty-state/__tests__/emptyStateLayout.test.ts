import { DEFAULT_ROLES, TILE_LAYOUT, BUBBLE_LAYOUT, scaleLeft, REFERENCE_WIDTH, floatFor, fillToBottom, fitTitleSize } from '../emptyStateLayout';
import { ROLES } from '@features/crew/data/categories';
import { ROLE_GLYPHS } from '@features/crew/data/roleTiles';

/**
 * The floating-cards illustration is laid out on a 390pt reference width and
 * scaled horizontally to the real one. The six default roles are REAL role ids,
 * each with an existing glyph and label — nothing invented for the empty state.
 */

it('defaults to six real roles: video, stills, editing, sound, lighting, design', () => {
  expect(DEFAULT_ROLES).toEqual(['videographer', 'photographer', 'editor', 'sound', 'lighting', 'graphic_designer']);
  for (const id of DEFAULT_ROLES) {
    expect(ROLES.find((r) => r.id === id)).toBeTruthy();
    expect(ROLE_GLYPHS[id]).toBeTruthy();
  }
});

it('places the tiles back to front exactly as specced, editing above sound', () => {
  expect(TILE_LAYOUT.map((t) => [t.role, t.left, t.top, t.rotate])).toEqual([
    ['videographer', 226, 22, -4],
    ['photographer', -14, 64, 5],
    ['sound', 196, 158, -2],
    ['editor', 92, 136, 3],
    ['lighting', -12, 262, -5],
    ['graphic_designer', 236, 284, 6],
  ]);
  const order = TILE_LAYOUT.map((t) => t.role);
  expect(order.indexOf('editor')).toBeGreaterThan(order.indexOf('sound'));
});

it('places the six bubbles as specced', () => {
  expect(BUBBLE_LAYOUT.map((b) => [b.left, b.top, b.rotate])).toEqual([
    [200, 26, -3], [-22, 82, 4], [62, 168, 2], [190, 196, -1], [-18, 290, -4], [214, 312, 5],
  ]);
});

it('scales left by width / 390 and leaves the reference width untouched', () => {
  expect(REFERENCE_WIDTH).toBe(390);
  expect(scaleLeft(226, 390)).toBe(226);
  expect(scaleLeft(226, 780)).toBe(452);
  expect(scaleLeft(-14, 195)).toBe(-7);
});

it('floats even cards up-and-right, odd cards less up and left, with durations 4.1–5.7s', () => {
  const even = floatFor(0);
  const odd = floatFor(1);
  expect([even.dy, even.dx, even.dRotate]).toEqual([-8, 2, 1.3]);
  expect([odd.dy, odd.dx, odd.dRotate]).toEqual([-6, -3, -1.2]);
  const durations = [0, 1, 2, 3, 4, 5].map((i) => floatFor(i).duration);
  for (const d of durations) { expect(d).toBeGreaterThanOrEqual(4100); expect(d).toBeLessThanOrEqual(5700); }
  expect(new Set(durations).size).toBeGreaterThan(1);
  const phases = [0, 1, 2, 3, 4, 5].map((i) => floatFor(i).phase);
  expect(new Set(phases).size).toBe(6);
});

it('fills from where the panel sits down to the bottom of the screen', () => {
  expect(fillToBottom(844, 300)).toBe(544);
  // Never negative (a panel scrolled partly above the top, or measured late).
  expect(fillToBottom(844, 900)).toBe(0);
});

describe('fitTitleSize — one line in English', () => {
  it('keeps the full 26pt when the title already fits', () => {
    expect(fitTitleSize('No chats', 342)).toBe(26);
  });

  it('shrinks a long title so it fits the width on one line', () => {
    const size = fitTitleSize("You don't have any inquiries yet", 342);
    expect(size).toBeLessThan(26);
    // Estimated Montserrat 800 width at that size fits the space.
    expect("You don't have any inquiries yet".length * 0.62 * size).toBeLessThanOrEqual(342);
  });

  it('never goes below a readable floor', () => {
    expect(fitTitleSize('x'.repeat(200), 342)).toBe(14);
  });
});
