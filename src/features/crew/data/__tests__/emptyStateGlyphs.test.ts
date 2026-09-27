import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES } from '../categories';
import { EMPTY_STATE_GLYPHS } from '../roleTiles';

/**
 * The empty state's floating cards draw each role glyph at 28pt while it rotates
 * and drifts. From the 256px source that was a 3× minification redone every
 * frame, which aliased ("pixels"). The same artwork is shipped pre-sized — 28 /
 * 56 / 84 px as base / @2x / @3x — so the card only ever moves a 1:1 bitmap.
 */

const DIR = join(__dirname, '..', '..', '..', '..', '..', 'assets', 'images', 'categories', 'empty-state');

/** Width, height and colour type straight from the PNG's IHDR chunk. */
function png(file: string) {
  const b = readFileSync(join(DIR, file));
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

it('has a glyph for every role', () => {
  for (const r of ROLES) expect(EMPTY_STATE_GLYPHS[r.id]).toBeTruthy();
});

it.each(ROLES.map((r) => r.id))('%s ships at 28 / 56 / 84 px, with transparency for the white tint', (id) => {
  for (const [suffix, px] of [['', 28], ['@2x', 56], ['@3x', 84]] as const) {
    const p = png(`${id}-glyph${suffix}.png`);
    expect([p.width, p.height]).toEqual([px, px]);
    expect([4, 6]).toContain(p.colorType); // grey+alpha or RGBA
  }
});
