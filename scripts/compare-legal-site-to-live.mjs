#!/usr/bin/env node
/**
 * Compares the BUILT legal site (legal-site/public) with what the live site serves, file by
 * file, by SHA-256. Read-only: public GETs, no credentials, nothing is deployed.
 *
 *   npm run legal:build && node scripts/compare-legal-site-to-live.mjs
 *   node scripts/compare-legal-site-to-live.mjs --all-live        (after the deploy: every file must be live)
 *   node scripts/compare-legal-site-to-live.mjs --origin https://bama-af0a0--some-channel.web.app
 *
 * Before a hosting deploy the legal pages must read IDENTICAL; only the new files (c.html,
 * og-invite.png) may read NOT LIVE YET. Exit 1 on any DIFFERS or ERROR, and with --all-live
 * on any NOT LIVE YET too.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_ORIGIN = 'https://bama-af0a0.web.app';

/** Where a built file is served: cleanUrls drops .html, and index.html is the root. */
export function urlPathFor(file) {
  if (file === 'index.html') return '/';
  return file.endsWith('.html') ? `/${file.slice(0, -'.html'.length)}` : `/${file}`;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

export function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    // Paths are relative to the TOP folder, so en/terms.html stays en/terms.html.
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out.sort();
}

/** One result per file: IDENTICAL | DIFFERS | NOT LIVE YET | ERROR. */
export async function compareFiles({ dir, origin = DEFAULT_ORIGIN, fetchImpl = fetch, files = listFiles(dir) }) {
  const results = [];
  for (const file of files) {
    const local = sha(readFileSync(join(dir, file)));
    const url = `${origin}${urlPathFor(file)}?nocache=${Date.now()}`;
    let status, live;
    try {
      const res = await fetchImpl(url, { headers: { 'cache-control': 'no-cache' }, redirect: 'manual' });
      status = res.status;
      if (status === 200) live = sha(Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      results.push({ file, status: 0, result: 'ERROR', detail: String(e.message ?? e) });
      continue;
    }
    const result = status === 404 ? 'NOT LIVE YET' : status !== 200 ? 'ERROR' : live === local ? 'IDENTICAL' : 'DIFFERS';
    results.push({ file, status, result, local: local.slice(0, 12), live: live?.slice(0, 12) });
  }
  return results;
}

/** Whether the run should fail. */
export function failed(results, { allLive = false } = {}) {
  return results.some((r) => r.result === 'DIFFERS' || r.result === 'ERROR' || (allLive && r.result === 'NOT LIVE YET'));
}

async function main() {
  const args = process.argv.slice(2);
  const value = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : undefined; };
  const origin = (value('--origin') ?? DEFAULT_ORIGIN).replace(/\/+$/, '');
  const dir = join(ROOT, 'legal-site/public');
  const results = await compareFiles({ dir, origin });
  console.log(`built: ${dir}\nlive:  ${origin}\n`);
  for (const r of results) console.log(`${r.result.padEnd(13)} ${String(r.status).padEnd(4)} ${r.file}${r.result === 'DIFFERS' ? `   (local ${r.local}, live ${r.live})` : ''}${r.detail ? `   ${r.detail}` : ''}`);
  const count = (k) => results.filter((r) => r.result === k).length;
  console.log(`\n${count('IDENTICAL')} identical, ${count('DIFFERS')} differ, ${count('NOT LIVE YET')} not live yet, ${count('ERROR')} error`);
  const bad = failed(results, { allLive: args.includes('--all-live') });
  console.log(bad ? 'RESULT: FAIL' : 'RESULT: OK');
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
