// node --test scripts/__tests__/*.test.mjs
//
// config/appLinks is read by createCommunityInvite, which hard-fails unless baseUrl
// is a bare https origin. The seed script's --verify uses the same rule, so a
// half-seeded or wrong config is caught at seed time instead of surfacing as a
// failed-precondition that reads like a code bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { isBareHttpsOrigin, validateAppLinks, APP_LINKS_DEV } from '../lib/appLinks.mjs';

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

test('agrees with the REAL buildInviteUrl from the compiled functions on every input', () => {
  // Loads the function createCommunityInvite actually uses, not a copy, so this
  // fails if the two rules ever drift apart.
  const require = createRequire(import.meta.url);
  const libPath = new URL('../../functions/lib/communities/inviteCore.js', import.meta.url);
  assert.ok(existsSync(libPath), 'functions/lib missing: run `npm --prefix functions run build` first');
  const { buildInviteUrl } = require(libPath.pathname);
  const cases = ['https://bama-af0a0.web.app', 'https://bama.app/', 'https://bama.co.il', 'http://bama.app', 'bama.app',
    'https://bama.app/c', 'https://bama.app?x=1', 'https://bama.app#x', 'https://user:pw@bama.app', '', 'nope', undefined, null, 42];
  for (const c of cases) assert.equal(isBareHttpsOrigin(c), buildInviteUrl(c, 'T'.repeat(22)) !== null, String(c));
});

test('validateAppLinks reports each problem', () => {
  assert.deepEqual(validateAppLinks(null), ['config/appLinks does not exist']);
  const problems = validateAppLinks({ baseUrl: 'http://x', iosUrl: 5 });
  assert.ok(problems.some((p) => /baseUrl/.test(p)));
  assert.ok(problems.some((p) => /iosUrl/.test(p)));
  assert.ok(problems.some((p) => /androidUrl/.test(p)));
});
