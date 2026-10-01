import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A VOICE MESSAGE'S BAR RUNS LEFT TO RIGHT IN BOTH LANGUAGES.
 *
 * In Hebrew the whole bubble used to mirror: the elapsed and total times
 * swapped sides and dragging the handle was mapped right-to-left, while the
 * filled part of the bar still grew from the left — so a drag moved the fill
 * the opposite way from the finger. Now the times and the bar keep the English
 * order (elapsed left, total right) and a drag follows the finger. Only the
 * play button still sits at the reading-start edge.
 */
const SRC = readFileSync(join(__dirname, '..', 'ChatRoomScreen.tsx'), 'utf8');
const bubble = SRC.slice(SRC.indexOf('function VoiceMessageBubble'), SRC.indexOf('type ListItem ='));

it('maps a drag straight to the position under the finger', () => {
  expect(bubble).toMatch(/const pct = Math\.max\(0, Math\.min\(1, e\.nativeEvent\.locationX \/ w\)\);/);
  expect(bubble).not.toMatch(/1 - raw/);
});

it('keeps elapsed → bar → total in one left-to-right group', () => {
  expect(bubble).toMatch(/testID="audio-timeline"[^>]*style=\{chatStyles\.audioTimeline\}/);
  expect(SRC).toMatch(/audioTimeline: \{\s*flex: 1,\s*flexDirection: 'row'/);
});
