import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * New rentals are paused for now: the rental tab has no + button.
 * The market tab keeps it.
 */
const SRC = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8');

it('the + button is only shown when posting is allowed on the active tab', () => {
  expect(SRC).toMatch(/\{canPost && \(\s*<TouchableOpacity style=\{\[styles\.fab/);
});

it('posting is off on the rental tab', () => {
  expect(SRC).toMatch(/const canPost = activeTab !== 'rental';/);
});
