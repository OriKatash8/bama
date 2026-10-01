import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The category strip uses CategoryTile (both icons mounted), not an inline tile. */
const SRC = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8');

it('renders each category with CategoryTile', () => {
  expect(SRC).toMatch(/<CategoryTile\s/);
  expect(SRC).not.toMatch(/function CategoryTile/);
  // No single image swapping its source by selection.
  expect(SRC).not.toMatch(/isActive && cat\.selectedIcon \? cat\.selectedIcon : cat\.icon/);
});
