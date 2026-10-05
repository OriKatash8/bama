// node --test scripts/__tests__/appLinksStoreLinks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isStoreUrl, storeLinks, validateAppLinks } from '../lib/appLinks.mjs';
import { exportAppLinks } from '../export-app-links.mjs';

const GOOD = { baseUrl: 'https://bama-af0a0.web.app', iosUrl: '', androidUrl: '' };

test('isStoreUrl: https links only', () => {
  assert.equal(isStoreUrl('https://apps.apple.com/app/id1'), true);
  for (const v of ['', 'http://x.com', 'javascript:alert(1)', 'https://u:p@x.com', 'https://', '//x.com', 'bama://c/x', null, undefined, 3, {}]) {
    assert.equal(isStoreUrl(v), false, String(v));
  }
});

test('storeLinks keeps only usable https URLs and nothing else from the doc', () => {
  assert.deepEqual(storeLinks({ ...GOOD, iosUrl: 'https://apps.apple.com/a', androidUrl: 'http://nope' }), { iosUrl: 'https://apps.apple.com/a', androidUrl: '' });
  assert.deepEqual(storeLinks(GOOD), { iosUrl: '', androidUrl: '' });
  assert.deepEqual(storeLinks(null), { iosUrl: '', androidUrl: '' });
  assert.deepEqual(Object.keys(storeLinks({ ...GOOD, secret: 1 })).sort(), ['androidUrl', 'iosUrl']);
});

test('validateAppLinks: store URLs must be empty or https (a bad one is caught at seed time)', () => {
  assert.deepEqual(validateAppLinks(GOOD), []);
  assert.deepEqual(validateAppLinks({ ...GOOD, iosUrl: 'https://apps.apple.com/a' }), []);
  assert.match(validateAppLinks({ ...GOOD, iosUrl: 'http://x' })[0], /iosUrl must be empty or an https URL/);
  assert.match(validateAppLinks({ ...GOOD, androidUrl: 'javascript:1' })[0], /androidUrl must be empty or an https URL/);
});

test('exportAppLinks writes only the two store URLs', async () => {
  const written = [];
  const links = await exportAppLinks({
    out: '/tmp/x/app-links.json',
    readDoc: async () => ({ ...GOOD, iosUrl: 'https://apps.apple.com/a' }),
    write: (path, text) => written.push([path, text]),
    mkdir: () => {},
  });
  assert.deepEqual(links, { iosUrl: 'https://apps.apple.com/a', androidUrl: '' });
  assert.equal(written.length, 1);
  assert.deepEqual(JSON.parse(written[0][1]), { iosUrl: 'https://apps.apple.com/a', androidUrl: '' });
  assert.ok(!written[0][1].includes('baseUrl'), 'baseUrl must not be published');
});

test('exportAppLinks refuses a missing or invalid doc and writes nothing', async () => {
  for (const doc of [null, { baseUrl: 'http://x', iosUrl: '', androidUrl: '' }, { ...GOOD, iosUrl: 'ftp://x' }]) {
    const written = [];
    await assert.rejects(exportAppLinks({ out: '/tmp/x', readDoc: async () => doc, write: () => written.push(1), mkdir: () => {} }), /not usable/);
    assert.equal(written.length, 0);
  }
});
