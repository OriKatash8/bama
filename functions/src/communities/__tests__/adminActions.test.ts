import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** adminCommunityAction: admins only, communities only; the owner is never removed. */
const SRC = readFileSync(join(__dirname, '..', 'adminActions.ts'), 'utf8');
const INDEX = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8');

it('is exported, in the default region where the app calls it', () => {
  expect(INDEX).toMatch(/export \* from '\.\/communities\/adminActions';/);
  expect(SRC).toMatch(/export const adminCommunityAction = onCall\(async/);
});

it('checks a signed-in admin before reading anything, and only acts on a community', () => {
  const read = SRC.indexOf('.get()');
  for (const check of ['requireAuth(', 'requireAdmin(']) {
    expect(SRC.indexOf(check)).toBeGreaterThan(-1);
    expect(SRC.indexOf(check)).toBeLessThan(read);
  }
  const guard = SRC.indexOf("snap.get('type') !== 'community'");
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(SRC.indexOf('switch (action'));
});

it('accepts only its four actions', () => {
  expect(SRC).toMatch(/const ACTIONS: Action\[\] = \['suspend', 'unsuspend', 'set_owner', 'remove_member'\];/);
  expect(SRC).toMatch(/!ACTIONS\.includes\(action as Action\)/);
});

it('suspend / unsuspend set the status', () => {
  expect(SRC).toMatch(/status: action === 'suspend' \? 'suspended' : 'active'/);
});

it('a new owner must be a real user, and becomes a member', () => {
  const block = SRC.slice(SRC.indexOf("case 'set_owner'"), SRC.indexOf("case 'remove_member'"));
  expect(block).toMatch(/db\.doc\(`users\/\$\{userId\}`\)\.get\(\)/);
  expect(block).toMatch(/if \(!user\.exists\) throw/);
  expect(block).toMatch(/ownerId: userId, members: FieldValue\.arrayUnion\(userId\)/);
});

it('removing a member never removes the owner, and logs a leave like the owner tool', () => {
  const block = SRC.slice(SRC.indexOf("case 'remove_member'"));
  const guard = block.indexOf("userId === snap.get('ownerId')");
  expect(guard).toBeGreaterThan(-1);
  expect(guard).toBeLessThan(block.indexOf('arrayRemove(userId)'));
  expect(block).toMatch(/collection\('communityEvents'\)/);
  expect(block).toMatch(/type: 'leave'/);
});
