import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every horizontal ScrollView on a tab screen that reaches the screen edges must spread
 * tabSwipeLockProps, or a swipe that starts on it can still switch tab. Add new strips here.
 */
const ROOT = join(__dirname, '../../../app/(professional)/(tabs)');
const STRIPS: [file: string, strips: number][] = [
  ['marketplace/index.tsx', 2], // category chips + active filter tags
  ['chats/index.tsx', 1],       // category pills
];

it.each(STRIPS)('%s: every horizontal strip spreads tabSwipeLockProps', (file, strips) => {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const horizontalScrollViews = src.match(/<ScrollView[^>]*?\n?\s*horizontal\b/g) ?? [];
  expect(horizontalScrollViews.length).toBeGreaterThanOrEqual(strips);
  expect((src.match(/\{\.\.\.tabSwipeLockProps\}/g) ?? []).length).toBe(strips);
  expect(src).toMatch(/from '@core\/navigation\/pagerSwipeLock'/);
});
