import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import en from '../translations/en.json';
import he from '../translations/he.json';

/**
 * EVERY CHARACTER IN A TRANSLATION MUST HAVE A GLYPH IN HEEBO.
 *
 * The app declares a fontFamily on essentially every Text. A declared family
 * gets no fallback cascade on Android: a codepoint the font has no glyph for
 * renders as a tofu box. iOS *does* cascade to the system font, which is why
 * this shipped unnoticed for months — it looked correct on the one device it
 * was tested on.
 *
 * What it hid: seven characters were being used as icons inside translation
 * strings — '← ↑ → ↓ ✓ ✕ ✦' — and Heebo has a glyph for none of them. One
 * screen had already worked around it with `t('search.back').replace('← ', '')`.
 * They are Lucide components now, and this test is what stops the next one.
 *
 * Emoji are exempt: they are rendered by the platform's emoji font, not by the
 * text font, on both platforms. Latin-only faces (Montserrat, Peace Sans) are
 * not checked against Hebrew here — they cannot render it at all, which is a
 * separate concern belonging to useAppFont's script selection.
 */

const FONT_DIR = join(__dirname, '..', '..', '..', '..', 'assets', 'fonts');

// ── A minimal TTF cmap reader ────────────────────────────────────────────────
// Deliberately dependency-free: adding fonttools-in-JS to devDependencies to
// assert a property of a checked-in binary is not worth the supply chain.

function readCmap(file: string): Set<number> {
  const buf = readFileSync(join(FONT_DIR, file));
  const numTables = buf.readUInt16BE(4);

  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('ascii', rec, rec + 4) === 'cmap') {
      cmapOffset = buf.readUInt32BE(rec + 8);
      break;
    }
  }
  if (cmapOffset < 0) throw new Error(`${file}: no cmap table`);

  // Prefer a Unicode subtable: (3,10) and (3,1) are what matter in practice.
  const numSub = buf.readUInt16BE(cmapOffset + 2);
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < numSub; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const offset = buf.readUInt32BE(rec + 4);
    const score =
      platform === 3 && encoding === 10 ? 4 :
      platform === 0 && encoding === 4  ? 3 :
      platform === 3 && encoding === 1  ? 2 :
      platform === 0                    ? 1 : 0;
    if (score > bestScore) { bestScore = score; best = cmapOffset + offset; }
  }
  if (best < 0) throw new Error(`${file}: no usable cmap subtable`);

  const codepoints = new Set<number>();
  const format = buf.readUInt16BE(best);

  if (format === 4) {
    const segX2 = buf.readUInt16BE(best + 6);
    const segs = segX2 / 2;
    const endBase = best + 14;
    const startBase = endBase + segX2 + 2;
    const deltaBase = startBase + segX2;
    const rangeBase = deltaBase + segX2;
    for (let s = 0; s < segs; s++) {
      const end = buf.readUInt16BE(endBase + s * 2);
      const start = buf.readUInt16BE(startBase + s * 2);
      if (start === 0xffff) continue;
      const delta = buf.readInt16BE(deltaBase + s * 2);
      const rangeOffset = buf.readUInt16BE(rangeBase + s * 2);
      for (let c = start; c <= end && c !== 0x10000; c++) {
        let gid: number;
        if (rangeOffset === 0) {
          gid = (c + delta) & 0xffff;
        } else {
          const gi = rangeBase + s * 2 + rangeOffset + (c - start) * 2;
          if (gi + 1 >= buf.length) continue;
          const raw = buf.readUInt16BE(gi);
          gid = raw === 0 ? 0 : (raw + delta) & 0xffff;
        }
        if (gid !== 0) codepoints.add(c);
      }
    }
  } else if (format === 12) {
    const nGroups = buf.readUInt32BE(best + 12);
    for (let g = 0; g < nGroups; g++) {
      const rec = best + 16 + g * 12;
      const start = buf.readUInt32BE(rec);
      const end = buf.readUInt32BE(rec + 4);
      const startGid = buf.readUInt32BE(rec + 8);
      if (startGid === 0) continue;
      for (let c = start; c <= end; c++) codepoints.add(c);
    }
  } else {
    throw new Error(`${file}: unsupported cmap format ${format}`);
  }

  return codepoints;
}

// ── The characters a translation may contain without a Heebo glyph ───────────

/** Rendered by the platform emoji font, never by the text font. */
function isEmoji(cp: number): boolean {
  return (
    (cp >= 0x1f000 && cp <= 0x1faff) || // pictographs, emoticons, transport…
    (cp >= 0x2600 && cp <= 0x27bf)   || // misc symbols + dingbats WITH emoji
    cp === 0xfe0f || cp === 0xfe0e   || // variation selectors
    cp === 0x200d                       // ZWJ
  );
}

/**
 * Dingbats in U+2600–U+27BF are only emoji-presentation by default for SOME
 * codepoints; '✓' (U+2713), '✕' (U+2715) and '✦' (U+2726) are text-presentation
 * and get NO emoji font. They are the exact characters that caused this bug, so
 * they are named here and excluded from the emoji exemption above.
 */
const TEXT_PRESENTATION_DINGBATS = new Set([0x2713, 0x2714, 0x2715, 0x2716, 0x2717, 0x2718, 0x2726, 0x2727]);

/** Zero-width / directional controls: no glyph needed, nothing is drawn. */
const INVISIBLE = new Set([
  0x200e, 0x200f, // LRM / RLM
  0x200b, 0x200c, 0x200d,
  0x2066, 0x2067, 0x2068, 0x2069, // isolates
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0xfeff,
]);

// ── Collect every codepoint the UI can render from a translation ─────────────

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function collect(node: Json, path: string, out: Map<number, string[]>): void {
  if (typeof node === 'string') {
    for (const ch of node) {
      const cp = ch.codePointAt(0)!;
      if (cp <= 0x7e) continue;
      const where = out.get(cp) ?? [];
      if (!where.includes(path)) where.push(path);
      out.set(cp, where);
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collect(v, `${path}[${i}]`, out));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collect(v, path ? `${path}.${k}` : k, out);
  }
}

const HEEBO_FACES = [
  'Heebo-Thin.ttf',
  'Heebo-ExtraLight.ttf',
  'Heebo-Light.ttf',
  'Heebo-Regular.ttf',
  'Heebo-Medium.ttf',
  'Heebo-SemiBold.ttf',
  'Heebo-Bold.ttf',
  'Heebo-ExtraBold.ttf',
  'Heebo-Black.ttf',
];

describe('translation glyph coverage', () => {
  const coverage = new Map(HEEBO_FACES.map((f) => [f, readCmap(f)] as const));

  it.each(HEEBO_FACES)('%s covers the whole Hebrew alphabet, ₪, geresh and gershayim', (face) => {
    const cm = coverage.get(face)!;
    const required: number[] = [
      ...Array.from({ length: 27 }, (_, i) => 0x05d0 + i), // alef … tav
      0x20aa, // ₪
      0x05f3, // ׳
      0x05f4, // ״
    ];
    const missing = required.filter((cp) => !cm.has(cp)).map((cp) => `U+${cp.toString(16).toUpperCase()}`);
    expect(missing).toEqual([]);
  });

  it.each([
    ['he.json', he as Json],
    ['en.json', en as Json],
  ])('%s contains no character Heebo cannot draw', (_file, tree) => {
    const used = new Map<number, string[]>();
    collect(tree, '', used);

    const cm = coverage.get('Heebo-Regular.ttf')!;
    const offenders: string[] = [];
    for (const [cp, keys] of used) {
      if (INVISIBLE.has(cp)) continue;
      if (isEmoji(cp) && !TEXT_PRESENTATION_DINGBATS.has(cp)) continue;
      if (cm.has(cp)) continue;
      offenders.push(
        `U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(cp)} — ${keys.slice(0, 3).join(', ')}`,
      );
    }

    // A character with no glyph is a tofu box on Android. Use a Lucide icon
    // component beside the text, or an emoji-presentation character, instead.
    expect(offenders).toEqual([]);
  });

  it('every weight covers the same set, so switching weight cannot introduce tofu', () => {
    const base = coverage.get('Heebo-Regular.ttf')!;
    for (const face of HEEBO_FACES) {
      const cm = coverage.get(face)!;
      const missing = [...base].filter((cp) => !cm.has(cp));
      expect({ face, missing }).toEqual({ face, missing: [] });
    }
  });
});

// ── Source literals: the Android backlog ─────────────────────────────────────

/**
 * GLYPHS HARDCODED IN JSX, TRACKED AS A BASELINE UNTIL ANDROID SHIPS.
 *
 * The translation files are clean, but '✕ ✓ ★ ☆ ← ▲ ▼ ✦ ⋯' also sit directly
 * in .tsx source — close buttons, star ratings, chevrons. iOS and the browser
 * substitute a system font for them, so they look right on every device BAMA
 * is tested on today. Android does not: each one is a tofu box there.
 *
 * iOS ships first, so they are not fixed yet. Instead this test pins the
 * current set in androidGlyphBaseline.json and fails on any change to it:
 *   - a NEW tofu glyph anywhere in src fails, naming file and character;
 *   - fixing one also fails until the baseline is regenerated, so the list
 *     only ever shrinks and never silently drifts out of date.
 * Before an Android release the baseline must be empty.
 *
 * Regenerate after fixing some:
 *   UPDATE_GLYPH_BASELINE=1 npx jest src/core/i18n/__tests__/fontCoverage.test.ts
 */

const SRC_DIR = join(__dirname, '..', '..', '..');
const BASELINE = join(__dirname, 'androidGlyphBaseline.json');

/** Dingbats that default to EMOJI presentation, so the emoji font draws them. */
const EMOJI_DEFAULT = new Set([0x2705, 0x2728, 0x274c, 0x274e, 0x2753, 0x2754, 0x2755, 0x2757, 0x26a1]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === '__tests__' || e === 'node_modules') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e) && !e.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Code with comments removed: block comments (JSX ones included) and line comments. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, '$1');
}

function scanSource(cm: Set<number>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of walk(SRC_DIR)) {
    const code = stripComments(readFileSync(file, 'utf8'));
    // console.* strings are logs, never rendered.
    const rendered = code.replace(/console\.\w+\([^\n]*/g, '');
    const chars = [...rendered];
    const bad = new Set<string>();
    chars.forEach((ch, i) => {
      const cp = ch.codePointAt(0)!;
      if (cp <= 0x7e || cm.has(cp) || INVISIBLE.has(cp)) return;
      if (cp >= 0x0590 && cp <= 0x05ff) return;             // Hebrew
      if (cp >= 0x1f000 || EMOJI_DEFAULT.has(cp)) return;   // emoji font
      if (chars[i + 1] === '\ufe0f') return;                // forced emoji
      if (cp === 0xfe0f || cp === 0xfe0e) return;            // the selector itself
      bad.add(ch);
    });
    if (bad.size) {
      const rel = file.slice(SRC_DIR.length + 1).split('\\').join('/');
      result[rel] = [...bad].sort().join(' ');
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

describe('hardcoded glyphs in source (Android backlog)', () => {
  it('matches androidGlyphBaseline.json exactly', () => {
    const cm = readCmap('Heebo-Regular.ttf');
    const actual = scanSource(cm);

    if (process.env.UPDATE_GLYPH_BASELINE) {
      writeFileSync(BASELINE, JSON.stringify(actual, null, 2) + '\n', 'utf8');
    }
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, string>;

    // New file or new character here? Use a Lucide icon instead of a text glyph.
    // Fixed some? Regenerate the baseline (see the comment above).
    expect(actual).toEqual(baseline);
  });
});
