import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * adminDeleteCommunity: admins only, communities only, everything under it.
 * Source-level, like contactWiring: the order of the checks is the point.
 */
const SRC = readFileSync(join(__dirname, '..', 'adminDelete.ts'), 'utf8');
const INDEX = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');

it('is exported, so it deploys', () => {
  expect(INDEX).toMatch(/export \* from '\.\/communities\/adminDelete';/);
});

it('checks the caller is a signed-in admin before reading anything', () => {
  const read = SRC.indexOf('.get()');
  expect(SRC.indexOf('requireAuth(')).toBeGreaterThan(-1);
  expect(SRC.indexOf('requireAuth(')).toBeLessThan(read);
  expect(SRC.indexOf('requireAdmin(')).toBeGreaterThan(-1);
  expect(SRC.indexOf('requireAdmin(')).toBeLessThan(read);
});

it('deletes only a community — never a DM or a project chat — and only after checking', () => {
  const guard = SRC.indexOf("snap.get('type') !== 'community'");
  const del = SRC.indexOf('db.recursiveDelete(ref)');
  expect(guard).toBeGreaterThan(-1);
  expect(del).toBeGreaterThan(guard);
});

it('removes the whole tree (channels, messages, requests), not just the document', () => {
  expect(SRC).toMatch(/db\.recursiveDelete\(ref\)/);
  expect(SRC).not.toMatch(/ref\.delete\(\)/);
});

it('lives in the default region, where the app calls its callables', () => {
  expect(SRC).toMatch(/export const adminDeleteCommunity = onCall\(async/);
});
