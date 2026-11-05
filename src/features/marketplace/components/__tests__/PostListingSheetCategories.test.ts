import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MARKET_CATEGORIES } from '@features/marketplace/data/categories';

/**
 * The listing form offers exactly the marketplace's tile row: a listing can
 * only be posted in a category users can filter by (no Studios, no Production).
 */
const SRC = readFileSync(join(__dirname, '..', 'PostListingSheet.tsx'), 'utf8');
const block = SRC.slice(SRC.indexOf('const CATEGORIES'), SRC.indexOf('];', SRC.indexOf('const CATEGORIES')));
const formIds = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);

it('offers the same categories as the tile row, in the same order', () => {
  expect(formIds).toEqual(MARKET_CATEGORIES.map((c) => c.id));
});

it('offers neither Studios nor Production', () => {
  expect(formIds).not.toContain('studio');
  expect(formIds).not.toContain('production');
});
