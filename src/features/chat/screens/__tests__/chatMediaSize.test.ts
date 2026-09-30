import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIA_BUBBLE_WIDTH } from '../../utils/mediaRatio';

/** Photo and video bubbles are a fixed WhatsApp-like width: 65% of the screen, at most 300. */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');

it('the media bubble uses the shared width', () => {
  expect(SRC).toMatch(/mediaBubble: \{\s*width: MEDIA_BUBBLE_WIDTH,/);
});

it('is 65% of the screen, never more than 300', () => {
  expect(MEDIA_BUBBLE_WIDTH).toBeGreaterThan(0);
  expect(MEDIA_BUBBLE_WIDTH).toBeLessThanOrEqual(300);
});
