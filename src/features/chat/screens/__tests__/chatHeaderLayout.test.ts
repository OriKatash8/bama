import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE CHAT HEADER READS LIKE WHATSAPP IN EACH LANGUAGE.
 * Back, then the chat's picture right beside it, then the name — mirrored in
 * Hebrew, so there the back button sits at the right edge next to the picture.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');
const header = SRC.slice(SRC.indexOf('{/* Header */}'), SRC.indexOf('{/* Channel tab bar (community only) */}'));

it('mirrors with the language', () => {
  expect(header).toMatch(/style=\{\[styles\.header, \{ flexDirection: rtl \? 'row-reverse' : 'row'/);
});

it('back comes first, then the picture, then the name', () => {
  const back = header.indexOf('style={styles.headerBack}');
  const photo = header.indexOf('chatStyles.headerPhotoBtn');
  const name = header.indexOf('<View style={[styles.headerCenter');
  expect(back).toBeGreaterThan(-1);
  expect(photo).toBeGreaterThan(back);
  expect(name).toBeGreaterThan(photo);
});

it('the back arrow points outward in each language, as an icon rather than a text glyph', () => {
  expect(header).toMatch(/rtl \? <ChevronRight[^>]*\/> : <ChevronLeft[^>]*\/>/);
  expect(header).not.toMatch(/>‹</);
});

it('the name sits next to the picture, aligned to the start side', () => {
  expect(header).toMatch(/styles\.headerCenter, \{ alignItems: rtl \? 'flex-end' : 'flex-start' \}/);
});
