/**
 * The Google-facing half of the functions drift check: list what is deployed, fetch each
 * function's uploaded source, and reduce it to a git tree hash. READ-ONLY: it only lists and
 * downloads. The pure logic (hashing, ledger evaluation) is in functionsLedger.mjs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { treeShaOfDir } from './functionsLedger.mjs';

/** Both generations. The v2 API lists them all; the v1 API is only needed for a 1st-gen version id. */
export async function listFunctions(get, projectId) {
  const all = [];
  let pageToken;
  do {
    const page = await get(`https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/-/functions?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`);
    all.push(...(page.functions ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  const v1 = await get(`https://cloudfunctions.googleapis.com/v1/projects/${projectId}/locations/-/functions`);
  const versionIds = new Map((v1.functions ?? []).map((f) => [f.name, f.versionId]));
  return all.map((f) => {
    const parts = f.name.split('/');
    return {
      name: parts[5],
      region: parts[3],
      generation: f.environment === 'GEN_1' ? 1 : 2,
      updateTime: f.updateTime,
      state: f.state,
      storage: f.buildConfig?.source?.storageSource ?? null,
      versionId: versionIds.get(f.name) ?? null,
    };
  });
}

/** The project NUMBER, which the source buckets are named after, read from any 2nd-gen source bucket. */
export function projectNumberOf(fns) {
  for (const f of fns) {
    const m = /^gcf-v2-sources-(\d+)-/.exec(f.storage?.bucket ?? '');
    if (m) return m[1];
  }
  return null;
}

const mediaUrl = (bucket, object) =>
  `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`;

/** Where this function's uploaded source zip is, or null. */
export async function locateSource(client, fn, projectNumber) {
  if (fn.generation === 2) return fn.storage?.bucket ? { bucket: fn.storage.bucket, object: fn.storage.object } : null;
  // 1st gen: the upload bucket in the response belongs to Google (403); the built copy is in the
  // project's own gcf-sources bucket as <fn>-<id>/version-<versionId>/function-source.zip.
  if (!projectNumber || !fn.versionId) return null;
  const bucket = `gcf-sources-${projectNumber}-${fn.region}`;
  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(`${fn.name}-`)}&fields=items(name)`;
  const items = (await client.request({ url, timeout: 60_000 })).data.items ?? [];
  const hit = items.find((i) => i.name.endsWith(`/version-${fn.versionId}/function-source.zip`));
  return hit ? { bucket, object: hit.name } : null;
}

/** Git tree hash of the uploaded `src/` folder, or null if it cannot be fetched or has no src/. */
export async function sourceTreeSha(client, fn, projectNumber) {
  let tmp;
  try {
    const loc = await locateSource(client, fn, projectNumber);
    if (!loc) return null;
    const res = await client.request({ url: mediaUrl(loc.bucket, loc.object), responseType: 'arraybuffer', timeout: 60_000 });
    tmp = mkdtempSync(join(tmpdir(), 'fnsrc-'));
    const zip = join(tmp, 'source.zip');
    writeFileSync(zip, Buffer.from(res.data));
    execFileSync('unzip', ['-q', '-o', zip, 'src/*', '-d', tmp], { stdio: 'ignore' });
    return existsSync(join(tmp, 'src')) ? treeShaOfDir(join(tmp, 'src')) : null;
  } catch {
    return null;
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

/**
 * treeSha -> { commit, date, subject } for every commit that touched functions/src (newest wins),
 * plus HEAD's. This is how a deployed source is named: by the commit it equals, or by none.
 */
export function commitIndex(repoRoot, max = 800) {
  const run = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
  const lines = run(['log', `--max-count=${max}`, '--format=%H\t%as\t%s', '--', 'functions/src']).split('\n').filter(Boolean).map((l) => l.split('\t'));
  const index = new Map();
  for (let i = 0; i < lines.length; i += 100) {
    const chunk = lines.slice(i, i + 100);
    let shas;
    try {
      shas = run(['rev-parse', ...chunk.map(([h]) => `${h}:functions/src`)]).split('\n');
    } catch {
      shas = chunk.map(([h]) => { try { return run(['rev-parse', `${h}:functions/src`]); } catch { return ''; } });
    }
    chunk.forEach(([hash, date, subject], j) => { if (shas[j] && !index.has(shas[j])) index.set(shas[j], { commit: hash.slice(0, 8), date, subject }); });
  }
  const headTree = run(['rev-parse', 'HEAD:functions/src']);
  return { index, headTree, head: run(['rev-parse', '--short=8', 'HEAD']) };
}
