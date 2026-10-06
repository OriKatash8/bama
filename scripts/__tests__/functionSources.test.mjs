// node --test scripts/__tests__/functionSources.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitIndex, listFunctions, locateSource, pool, projectNumberOf } from '../lib/functionSources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const v2 = (name, region, env, storage, updateTime = 'T') => ({ name: `projects/p/locations/${region}/functions/${name}`, environment: env, state: 'ACTIVE', updateTime, buildConfig: { source: { storageSource: storage } } });

test('listFunctions merges both generations and picks up a 1st-gen version id from the v1 API; follows pages', async () => {
  const pages = {
    'https://cloudfunctions.googleapis.com/v2/projects/p/locations/-/functions?pageSize=100': { functions: [v2('a', 'europe-west1', 'GEN_2', { bucket: 'gcf-v2-sources-123-europe-west1', object: 'a/function-source.zip' })], nextPageToken: 'n2' },
    'https://cloudfunctions.googleapis.com/v2/projects/p/locations/-/functions?pageSize=100&pageToken=n2': { functions: [v2('b', 'us-central1', 'GEN_1', { bucket: 'uploads-9.x', object: 'u.zip' })] },
    'https://cloudfunctions.googleapis.com/v1/projects/p/locations/-/functions': { functions: [{ name: 'projects/p/locations/us-central1/functions/b', versionId: '18' }] },
  };
  const out = await listFunctions(async (url) => { assert.ok(url in pages, url); return pages[url]; }, 'p');
  assert.deepEqual(out.map((f) => [f.name, f.region, f.generation, f.versionId]), [['a', 'europe-west1', 2, null], ['b', 'us-central1', 1, '18']]);
  assert.equal(projectNumberOf(out), '123');
  assert.equal(projectNumberOf([{ storage: null }]), null);
});

test('a 2nd-gen source is where the API says; a 1st-gen source is found in the project bucket by its version id', async () => {
  const gen2 = { name: 'a', generation: 2, region: 'r', storage: { bucket: 'B', object: 'O' } };
  assert.deepEqual(await locateSource(null, gen2, '1'), { bucket: 'B', object: 'O' });
  const calls = [];
  const client = { request: async ({ url }) => { calls.push(url); return { data: { items: [{ name: 'f-uuid/version-17/function-source.zip' }, { name: 'f-uuid/version-18/function-source.zip' }] } }; } };
  const gen1 = { name: 'f', generation: 1, region: 'us-central1', versionId: '18' };
  assert.deepEqual(await locateSource(client, gen1, '777'), { bucket: 'gcf-sources-777-us-central1', object: 'f-uuid/version-18/function-source.zip' });
  assert.match(calls[0], /gcf-sources-777-us-central1\/o\?prefix=f-/);
  assert.equal(await locateSource(client, { ...gen1, versionId: '99' }, '777'), null, 'no such version: null, not a guess');
  assert.equal(await locateSource(client, { ...gen1, versionId: null }, '777'), null);
  assert.equal(await locateSource(client, gen1, null), null);
});

test('pool never runs more than `limit` at once and returns results in input order', async () => {
  let live = 0, peak = 0;
  const out = await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return n * 2; });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3 && peak >= 2, `peak ${peak}`);
});

test('commitIndex names HEAD\'s functions/src by an actual commit, in the repo', () => {
  const { index, headTree, head } = commitIndex(ROOT);
  assert.equal(headTree, execFileSync('git', ['rev-parse', 'HEAD:functions/src'], { cwd: ROOT, encoding: 'utf8' }).trim());
  const hit = index.get(headTree);
  assert.ok(hit, 'HEAD\'s tree is not in the index');
  assert.match(hit.commit, /^[0-9a-f]{8}$/);
  assert.match(head, /^[0-9a-f]{8}$/);
});
