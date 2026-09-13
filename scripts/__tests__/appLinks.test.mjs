// node --test scripts/__tests__/*.test.mjs
//
// config/appLinks is read by createCommunityInvite, which hard-fails unless baseUrl
// is a bare https origin. The seed script's --verify uses the same rule (the real
// function, imported from source), so a
// half-seeded or wrong config is caught at seed time instead of surfacing as a
// failed-precondition that reads like a code bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBareHttpsOrigin, validateAppLinks, APP_LINKS_DEV, buildInviteUrl } from '../lib/appLinks.mjs';

test('the development value is the web.app origin with empty store links', () => {
  assert.deepEqual(APP_LINKS_DEV, { baseUrl: 'https://bama-af0a0.web.app', iosUrl: '', androidUrl: '' });
  assert.deepEqual(validateAppLinks(APP_LINKS_DEV), []);
});

for (const ok of ['https://bama-af0a0.web.app', 'https://bama.app/', 'https://bama.co.il']) {
  test(`bare https origin: ${ok}`, () => assert.equal(isBareHttpsOrigin(ok), true));
}
for (const bad of ['', 'http://bama.app', 'bama.app', 'https://bama.app/c', 'https://bama.app?x=1',
  'https://bama.app#x', 'https://user:pw@bama.app', undefined, null, 42]) {
  test(`not a bare https origin: ${JSON.stringify(bad)}`, () => assert.equal(isBareHttpsOrigin(bad), false));
}

test('uses the REAL buildInviteUrl from the functions source, not a copy', async () => {
  // Same module instance the functions source exports, imported from the .ts file.
  const real = await import(new URL('../../functions/src/communities/inviteCore.ts', import.meta.url).href);
  assert.equal(buildInviteUrl, real.buildInviteUrl, 'appLinks must delegate to inviteCore.buildInviteUrl itself');
  const cases = ['https://bama-af0a0.web.app', 'https://bama.app/', 'http://bama.app', 'https://bama.app/c', '', 'nope', undefined, 42];
  for (const c of cases) assert.equal(isBareHttpsOrigin(c), real.buildInviteUrl(c, 'T'.repeat(22)) !== null, String(c));
});

test('the module has no URL rule of its own', () => {
  const src = readFileSync(new URL('../lib/appLinks.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /new URL\(v\)|protocol ===|pathname ===/, 'appLinks.mjs must not reimplement the origin check');
});

test('validateAppLinks reports each problem', () => {
  assert.deepEqual(validateAppLinks(null), ['config/appLinks does not exist']);
  const problems = validateAppLinks({ baseUrl: 'http://x', iosUrl: 5 });
  assert.ok(problems.some((p) => /baseUrl/.test(p)));
  assert.ok(problems.some((p) => /iosUrl/.test(p)));
  assert.ok(problems.some((p) => /androidUrl/.test(p)));
});
