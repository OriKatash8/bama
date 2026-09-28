import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The project details header puts its back button where the chat header does:
 * the right edge in Hebrew, the left in English — the row mirrors, the title
 * stays centred (the spacer on the far side balances the button).
 */
const SRC = readFileSync(join(__dirname, '..', 'project-details.tsx'), 'utf8');
const header = SRC.slice(SRC.indexOf('{/* Header — scrolls with content'), SRC.indexOf('{/* Removal banner'));

it('mirrors with the language', () => {
  expect(header).toMatch(/style=\{\[styles\.header, \{ flexDirection: rtl \? 'row-reverse' : 'row', marginHorizontal: -16, marginTop: -16 \}\]\}/);
});

it('the back button comes first in the row, the balancing spacer last', () => {
  expect(header.indexOf('style={styles.headerBack}')).toBeLessThan(header.indexOf('style={styles.headerCenter}'));
  expect(header.indexOf('style={styles.headerCenter}')).toBeLessThan(header.indexOf('style={styles.headerRight}'));
});

it('the back arrow points outward, as an icon rather than a text glyph', () => {
  expect(header).toMatch(/rtl \? <ChevronRight[^>]*\/> : <ChevronLeft[^>]*\/>/);
  expect(header).not.toMatch(/\{'‹'\}/);
});
