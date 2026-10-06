// node --test scripts/__tests__/compareLegalSite.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareFiles, failed, listFiles, urlPathFor } from '../compare-legal-site-to-live.mjs';

test('urlPathFor mirrors cleanUrls: index is the root, .html is dropped, assets keep their name', () => {
  assert.equal(urlPathFor('index.html'), '/');
  assert.equal(urlPathFor('terms.html'), '/terms');
  assert.equal(urlPathFor('en/privacy.html'), '/en/privacy');
  assert.equal(urlPathFor('c.html'), '/c');
  assert.equal(urlPathFor('og-invite.png'), '/og-invite.png');
  assert.equal(urlPathFor('logo.webp'), '/logo.webp');
});

function site() {
  const dir = mkdtempSync(join(tmpdir(), 'cmp-'));
  mkdirSync(join(dir, 'en'));
  writeFileSync(join(dir, 'terms.html'), 'TERMS');
  writeFileSync(join(dir, 'en', 'terms.html'), 'EN TERMS');
  writeFileSync(join(dir, 'c.html'), 'INVITE');
  return dir;
}
const reply = (status, body) => ({ status, arrayBuffer: async () => Buffer.from(body ?? '') });
const liveWith = (map) => async (url) => {
  const path = new URL(url).pathname;
  return path in map ? reply(200, map[path]) : reply(404);
};

test('listFiles walks subfolders', () => {
  assert.deepEqual(listFiles(site()), ['c.html', 'en/terms.html', 'terms.html']);
});

test('identical legal pages and a not-yet-live new page: OK before the deploy, FAIL with --all-live', async () => {
  const results = await compareFiles({ dir: site(), fetchImpl: liveWith({ '/terms': 'TERMS', '/en/terms': 'EN TERMS' }) });
  assert.deepEqual(results.map((r) => [r.file, r.result]), [['c.html', 'NOT LIVE YET'], ['en/terms.html', 'IDENTICAL'], ['terms.html', 'IDENTICAL']]);
  assert.equal(failed(results), false);
  assert.equal(failed(results, { allLive: true }), true);
});

test('a legal page whose live bytes differ FAILS, even with a single changed character', async () => {
  const results = await compareFiles({ dir: site(), fetchImpl: liveWith({ '/terms': 'TERMS ', '/en/terms': 'EN TERMS', '/c': 'INVITE' }) });
  assert.equal(results.find((r) => r.file === 'terms.html').result, 'DIFFERS');
  assert.equal(failed(results), true);
});

test('after the deploy everything is live and identical: passes even with --all-live', async () => {
  const results = await compareFiles({ dir: site(), fetchImpl: liveWith({ '/terms': 'TERMS', '/en/terms': 'EN TERMS', '/c': 'INVITE' }) });
  assert.equal(failed(results, { allLive: true }), false);
});

test('a network error or a redirect/5xx is an ERROR, never a pass', async () => {
  const boom = async () => { throw new Error('offline'); };
  assert.equal((await compareFiles({ dir: site(), fetchImpl: boom })).every((r) => r.result === 'ERROR'), true);
  const redirect = async () => reply(301);
  assert.equal(failed(await compareFiles({ dir: site(), fetchImpl: redirect })), true);
});

test('it hashes bytes, so it agrees with sha256 of the file', async () => {
  const dir = site();
  const [r] = await compareFiles({ dir, files: ['terms.html'], fetchImpl: liveWith({ '/terms': 'TERMS' }) });
  assert.equal(r.local, createHash('sha256').update('TERMS').digest('hex').slice(0, 12));
});
