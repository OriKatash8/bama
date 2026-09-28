import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '@core/i18n/translations/en.json';
import he from '@core/i18n/translations/he.json';

/**
 * The chat's send button follows the language: "Send" in English, "שלח" in
 * Hebrew — the same key the media preview's send button already uses.
 */

const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('the key reads Send / שלח', () => {
  expect(en.chats.record_send).toBe('Send');
  expect(he.chats.record_send).toBe('שלח');
});

it('no send button spells "Send" in the code', () => {
  expect(SRC).not.toMatch(/>\s*Send\s*</);
});

it('the composer send button and the media preview both use the key', () => {
  expect(SRC.match(/\{t\('chats\.record_send'\)\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
});
