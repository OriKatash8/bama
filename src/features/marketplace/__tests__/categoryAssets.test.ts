import path from 'path';
import { readRgba } from '../../../testing/pngAlpha';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * THE MARKETPLACE CATEGORY STRIP: PLURAL NAMES, NO GLOW.
 *
 * A category holds many things, so it is named in the plural. And the six
 * unselected icons carried a soft blue halo baked into the PNG — the selected
 * six never did, so the strip gained and lost a shadow as you tapped along it.
 */

const ICON_DIR = path.join(__dirname, '../../../../assets/images/categories');

/** unselected icon → its already-glowless selected twin */
const PAIRS: [string, string][] = [
  ['camera.png', 'photographer-sheet.png'],
  ['101.png', '10.png'],
  ['audio.png', '12.png'],
  ['teuraicon.png', 'lighting.png'],
  ['drone.png', '11.png'],
  ['studio.png', '14.png'],
];

/** Pixels that are neither solid nor clear. On these icons that is the rounded
 *  corner's anti-aliasing — and, before this, the halo. */
function softPixels(file: string) {
  let soft = 0;
  let blueSoft = 0;
  for (const { r, b, a } of readRgba(path.join(ICON_DIR, file))) {
    if (a >= 3 && a < 250) {
      soft += 1;
      if (b - r > 60) blueSoft += 1;
    }
  }
  return { soft, blueSoft };
}

describe('category icons', () => {
  it.each(PAIRS)('%s carries no more soft pixels than its glowless twin %s', (icon, twin) => {
    // The halo was ~31,000 soft pixels against the twin's ~1,200 of corner
    // anti-aliasing, so this is not a close-run comparison.
    expect(softPixels(icon).soft).toBeLessThanOrEqual(softPixels(twin).soft);
  });

  it.each(PAIRS.map(([icon]) => icon))('%s has no blue fringe on its corners', (icon) => {
    // Lifting the twin's alpha alone left the corner anti-aliasing carrying the
    // halo's blue, which tinted the rounded corners.
    expect(softPixels(icon).blueSoft).toBe(0);
  });
});

describe('category names', () => {
  it('names the countable categories in the plural', () => {
    expect(en.marketplace.category_camera).toBe('Cameras');
    expect(en.marketplace.category_lens).toBe('Lenses');
    expect(en.marketplace.category_light).toBe('Lights');
    expect(en.marketplace.category_drone).toBe('Drones');
    expect(he.marketplace.category_camera).toBe('מצלמות');
    expect(he.marketplace.category_lens).toBe('עדשות');
    expect(he.marketplace.category_drone).toBe('רחפנים');
  });

  it('leaves the mass nouns alone — there is no plural of "audio"', () => {
    expect(en.marketplace.category_audio).toBe('Audio');
    expect(he.marketplace.category_audio).toBe('אודיו');
    expect(he.marketplace.category_light).toBe('תאורה');
  });
});

/**
 * The decoder above is hand-rolled, so it is checked against numbers produced
 * independently (Pillow) rather than trusted. If it silently decoded to
 * nonsense, every assertion above would pass on nonsense too.
 */
it('decodes a known icon to the counts an independent decoder reports', () => {
  const px = readRgba(path.join(ICON_DIR, 'camera.png'));
  expect(px).toHaveLength(400 * 400);
  expect(px.filter((p) => p.a >= 250)).toHaveLength(43780);
  expect(softPixels('camera.png').soft).toBe(1186);
  // Centre of the card: the blue camera body.
  expect(px[200 * 400 + 200]).toEqual({ r: 12, g: 76, b: 176, a: 255 });
});

describe('unselected icons: the blue glyph alone, no near-white square', () => {
  const { MARKET_CATEGORIES } = jest.requireActual('@features/marketplace/data/categories');
  const CUT_OUT: Record<string, string> = {
    camera: 'camera', lens: '101', audio: 'audio', lighting: 'teuraicon', drone: 'drone',
    accessories: 'backdrop', grip: 'tripod',
  };

  it('the PNG tiles (and the empty state\'s cards) use the cut-out of each icon', () => {
    const png = MARKET_CATEGORIES.filter((c: { icon?: number }) => c.icon !== undefined);
    expect(png.map((c: { id: string }) => c.id)).toEqual(Object.keys(CUT_OUT));
    for (const c of png) {
      expect(c.icon).toBe(require(path.join(ICON_DIR, `market-${CUT_OUT[c.id]}.png`)));
    }
  });

  it('every tile is a PNG pair', () => {
    expect(MARKET_CATEGORIES.every((c: { icon?: number; Icon?: unknown }) => c.icon !== undefined && !c.Icon)).toBe(true);
  });

  it('the row (both tabs): no Studios or Production — and never unsorted or hidden', () => {
    expect(MARKET_CATEGORIES.map((c: { id: string }) => c.id)).toEqual(
      ['camera', 'lens', 'audio', 'lighting', 'drone', 'accessories', 'grip'],
    );
  });

  it('transparent where the square was, so the sheet or card colour shows through', () => {
    for (const f of Object.values(CUT_OUT)) {
      const px = readRgba(path.join(ICON_DIR, `market-${f}.png`));
      // 400px wide; just inside the old square's top-left corner (it spanned 94–306).
      expect(px[110 * 400 + 110].a).toBe(0);
    }
  });
});

/**
 * Studio Accessories (backdrop stand) and Grip & Support (tripod), rendered from
 * SVG in the Lights/Drones format: 400px, the glyph alone in #0C4CB0, and the
 * selected tile on the same gradient square with the glyph in white.
 */
describe('the backdrop and tripod tiles', () => {
  it.each(['backdrop', 'tripod'])('%s: a 400px #0C4CB0 glyph on a transparent canvas, the size of the others', (name) => {
    const px = readRgba(path.join(ICON_DIR, `market-${name}.png`));
    expect(px).toHaveLength(400 * 400);
    const solid = px.filter((p) => p.a >= 250);
    expect(new Set(solid.map((p) => `${p.r},${p.g},${p.b}`))).toEqual(new Set(['12,76,176']));
    // Footprint: Lights is 148×172px and Drones 184×79px on the same canvas.
    const on = px.map((p, i) => ({ ...p, x: i % 400, y: Math.floor(i / 400) })).filter((p) => p.a >= 128);
    const w = Math.max(...on.map((p) => p.x)) - Math.min(...on.map((p) => p.x));
    const h = Math.max(...on.map((p) => p.y)) - Math.min(...on.map((p) => p.y));
    expect(Math.max(w, h)).toBeGreaterThan(140);
    expect(Math.max(w, h)).toBeLessThan(190);
  });

  it.each(['backdrop', 'tripod'])('%s-selected: the Drones tile\'s square and gradient, a white glyph', (name) => {
    const px = readRgba(path.join(ICON_DIR, `${name}-selected.png`));
    const drone = readRgba(path.join(ICON_DIR, '11.png'));
    // Same square: the same pixels are opaque or clear as on the Drones tile.
    expect(px.filter((p) => p.a >= 250)).toHaveLength(drone.filter((p) => p.a >= 250).length);
    // Same gradient at the edges, where neither glyph reaches.
    for (const i of [200 * 400 + 96, 200 * 400 + 304, 110 * 400 + 200]) expect(px[i]).toEqual(drone[i]);
    expect(px.some((p) => p.a >= 250 && p.r > 240 && p.g > 240 && p.b > 240)).toBe(true);
  });
});
