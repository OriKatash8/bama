import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Users is reached from the dashboard's "total users" tile, not the tab bar. */
const SRC = readFileSync(join(__dirname, '..', '_layout.tsx'), 'utf8');

it('the users screen is hidden from the tab bar', () => {
  expect(SRC).toMatch(/<Tabs\.Screen name="users" options=\{\{ href: null \}\} \/>/);
});
