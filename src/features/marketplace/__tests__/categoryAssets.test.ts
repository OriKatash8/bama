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
