import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The admin runs on web, where Alert.alert silently does nothing — that is why
 * "delete community" (and the courses / marketplace deletes) did nothing at all.
 * Every admin confirm goes through confirmDialog (window.confirm on web).
 */
const DIR = join(__dirname, '..');
const pages = readdirSync(DIR).filter((f) => f.endsWith('.tsx'));

it.each(pages)('%s never calls Alert.alert directly', (file) => {
  const src = readFileSync(join(DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  expect(src).not.toMatch(/Alert\.alert\(/);
});

it('the three deletes confirm through confirmDialog', () => {
  for (const f of ['communities.tsx', 'courses.tsx', 'marketplace.tsx']) {
    expect(readFileSync(join(DIR, f), 'utf8')).toMatch(/await confirmDialog\(/);
  }
});
