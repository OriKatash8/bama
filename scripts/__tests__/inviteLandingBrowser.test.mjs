// node --test scripts/__tests__/inviteLandingBrowser.test.mjs
// The landing page in a REAL browser engine, served by a tiny local server built from the real
// build output, with /app-links.json absent (404) or never answering. Skips (says so) for an
// engine that is not installed: `npx playwright install chromium webkit`.
// Not Mobile Safari: Playwright's WebKit shares the engine, not iOS's URL-scheme handling or UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from '../build-legal-site.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN = 'ZzYyXxWwVvUuTtSsRrQqPp';

let playwright = null;
try { playwright = createRequire(join(ROOT, 'package.json'))('playwright'); } catch { /* not installed */ }

/** Serves the built site like Hosting does: /c/** -> c.html, cleanUrls, app-links per `mode`. */
async function serve(mode) {
  const out = join(mkdtempSync(join(tmpdir(), 'landing-')), 'public');
  build(join(ROOT, 'legal-site/src'), out, join(ROOT, 'legal-site/static'));
  if (mode !== 'default') rmSync(join(out, 'app-links.json'), { force: true });
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/app-links.json' && mode === 'hang') return; // never answers
    const file = path.startsWith('/c/') ? 'c.html' : path.slice(1);
    const full = join(out, file);
    if (!file || !existsSync(full)) { res.writeHead(404); return res.end('Page Not Found'); }
    res.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    res.end(readFileSync(full));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

for (const engine of ['chromium', 'webkit']) {
  for (const mode of ['absent', 'default', 'hang']) {
    test(`${engine}: /app-links.json ${mode}: the href is bama://c/<token> after the failure settles, and the stores area answers`, async (t) => {
      if (!playwright) return t.skip('playwright is not installed');
      let browser;
      try { browser = await playwright[engine].launch(); } catch (e) { return t.skip(`${engine} is not installed (${String(e.message).split('\n')[0]})`); }
      const site = await serve(mode);
      try {
        const page = await (await browser.newContext()).newPage();
        await page.goto(`${site.origin}/c/${TOKEN}`);
        // The stores area appears once the request has failed, answered, or timed out (4 s).
        await page.waitForSelector('#get-app:not([hidden])', { timeout: 8000 });
        const got = await page.evaluate(() => ({
          attr: document.getElementById('open').getAttribute('href'),
          resolved: document.getElementById('open').href,
          debug: document.getElementById('debug-link').textContent,
          noStores: !document.getElementById('no-stores').hidden,
        }));
        assert.equal(got.attr, `bama://c/${TOKEN}`);
        assert.equal(got.resolved, `bama://c/${TOKEN}`);
        assert.equal(got.debug, `bama://c/${TOKEN}`);
        assert.equal(got.noStores, true);
      } finally { await browser.close(); site.close(); }
    });
  }
}
