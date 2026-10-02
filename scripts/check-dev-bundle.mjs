#!/usr/bin/env node
/**
 * Does the app actually BUNDLE in development mode, for iOS and for web?
 *
 *   npm run check:bundle
 *
 * Tests, tsc and `expo export` (a production bundle) all passed on 2026-10-02
 * while `npx expo start -c` failed on both platforms: a stray
 * `.env.test-logins.local` in the project root was compiled as JavaScript and
 * threw a SyntaxError at 1:0. The iPhone showed the error, web went blank. Only
 * requesting the dev bundle catches that, so this does exactly that:
 *
 *   1. fails if a .env* file other than .env / .env.example sits in the root;
 *   2. starts a throwaway dev server (`expo start -c`) on a spare port — never
 *      8081, so a running Metro is untouched;
 *   3. requests the iOS and web DEV bundles; anything but HTTP 200 fails;
 *   4. always stops its server, including on Ctrl-C.
 *
 * On failure it prints the error's FIRST LINE only. Metro's code frame shows the
 * opening lines of the failing file — which is how a test password reached the
 * screen — so the frame is never printed.
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED_ENV = new Set(['.env', '.env.example']);
const PLATFORMS = ['ios', 'web'];
const START_TIMEOUT_MS = 180_000;
const BUNDLE_TIMEOUT_MS = 600_000;

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// ── 1. stray env files ─────────────────────────────────────────────────────
const stray = readdirSync(ROOT).filter((n) => /^\.env/.test(n) && !ALLOWED_ENV.has(n));
if (stray.length) fail(`env-style file(s) in the project root: ${stray.join(', ')} — move them outside the project`);
else pass('no stray .env* files in the project root');

// ── 2. a spare port ────────────────────────────────────────────────────────
function freePort(start) {
  return new Promise((resolve) => {
    const tryPort = (p) => {
      if (p === 8081) return tryPort(p + 1);
      const s = createServer().once('error', () => tryPort(p + 1)).once('listening', () => s.close(() => resolve(p)));
      s.listen(p, '127.0.0.1');
    };
    tryPort(start);
  });
}
const port = await freePort(8097);

const server = spawn('npx', ['expo', 'start', '-c', '--port', String(port)], {
  cwd: ROOT, env: { ...process.env, CI: '1' }, detached: true, stdio: 'ignore',
});
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(1); });
process.on('exit', stop);

const base = `http://127.0.0.1:${port}`;
const deadline = Date.now() + START_TIMEOUT_MS;
let up = false;
while (Date.now() < deadline) {
  try { if ((await (await fetch(`${base}/status`)).text()).includes('running')) { up = true; break; } } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 2000));
}

// ── 3. the dev bundles ─────────────────────────────────────────────────────
if (!up) {
  fail(`dev server did not start on port ${port} within ${START_TIMEOUT_MS / 1000}s`);
} else {
  for (const platform of PLATFORMS) {
    const url = `${base}/node_modules/expo-router/entry.bundle?platform=${platform}&dev=true&minify=false&transform.routerRoot=src%2Fapp`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(BUNDLE_TIMEOUT_MS) });
      const body = await res.text();
      if (res.status === 200) {
        pass(`${platform} dev bundle builds (${(body.length / 1e6).toFixed(1)} MB)`);
      } else {
        let first = `HTTP ${res.status}`;
        try {
          const err = JSON.parse(body);
          first = `${err.type ?? 'Error'}: ${String(err.message ?? '').split('\n')[0].replace(/\u001b\[[0-9;]*m/g, '')}`;
        } catch { /* not JSON */ }
        fail(`${platform} dev bundle: ${first}`);
      }
    } catch (e) {
      fail(`${platform} dev bundle request failed: ${e?.name ?? e}`);
    }
  }
}
stop();
console.log(`\n${failures === 0 ? 'DEV BUNDLES OK' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
