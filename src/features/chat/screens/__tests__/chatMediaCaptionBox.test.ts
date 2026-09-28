import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The caption you write with a photo or video sits in the same rounded box as
 * the chat's message field: same shape (styles.input), mode tint fill, mode
 * accent border, and the same text direction handling in Hebrew.
 */

const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

/** The caption TextInput, from its testID back to its opening tag. */
const caption = (() => {
  const i = SRC.indexOf('testID="media-caption-input"');
  expect(i).toBeGreaterThan(-1);
  const start = SRC.lastIndexOf('<TextInput', i);
  return SRC.slice(start, SRC.indexOf('/>', i));
})();

it('uses the chat box shape, filled and bordered in the mode colours', () => {
  expect(caption).toMatch(/style=\{\[styles\.input, \{/);
  expect(caption).toContain('backgroundColor: modeTint');
  expect(caption).toContain('borderColor: modeAccent');
});

it('reads right to left in Hebrew, like the message field', () => {
  expect(caption).toContain("textAlign: rtl ? 'right' : 'left'");
  expect(caption).toContain("writingDirection: rtl ? 'rtl' : 'ltr'");
});

it('still sets the caption and shows its placeholder', () => {
  expect(caption).toContain('value={pendingCaption}');
  expect(caption).toContain('onChangeText={setPendingCaption}');
  expect(caption).toContain("placeholder={t('chats.caption_placeholder')}");
});

it('the old bare caption style is gone', () => {
  expect(SRC).not.toMatch(/previewStyles\.captionInput/);
});
