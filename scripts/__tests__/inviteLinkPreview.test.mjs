// node --test scripts/__tests__/inviteLinkPreview.test.mjs
//
// The card WhatsApp & co. show when an invite link is pasted. Scrapers read the BUILT page
// (the source holds a {{SITE_ORIGIN}} placeholder) and do not run JavaScript, so this is one
// generic card for every invite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, SITE_ORIGIN } from '../build-legal-site.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(mkdtempSync(join(tmpdir(), 'invite-og-')), 'public');
build(join(ROOT, 'legal-site/src'), out, join(ROOT, 'legal-site/static'));
const html = readFileSync(join(out, 'c.html'), 'utf8');

/** content="..." of the first <meta property|name="key" ...>, or null. */
const meta = (key) => {
  const m = html.match(new RegExp(`<meta (?:property|name)="${key.replace(/[:.]/g, '\\$&')}" content="([^"]*)">`));
  return m ? m[1] : null;
};

test('every required Open Graph and Twitter tag is there', () => {
  for (const k of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    assert.ok(meta(k), `missing ${k}`);
  }
  assert.equal(meta('og:type'), 'website');
  assert.equal(meta('twitter:card'), 'summary_large_image');
});

test('Hebrew first with English after it; generic (no community, no token)', () => {
  assert.match(meta('og:title'), /הוזמנת להצטרף לקהילה ב-BAMA/);
  assert.match(meta('og:description'), /אפשר לשלוח בקשה להצטרף/);
  assert.match(meta('og:description'), /Open this link in the BAMA app to ask to join/);
  assert.equal(meta('twitter:title'), meta('og:title'));
  assert.equal(meta('twitter:description'), meta('og:description'));
  assert.equal(meta('og:locale'), 'he_IL');
  assert.equal(meta('og:locale:alternate'), 'en_US');
  for (const k of ['og:title', 'og:description', 'og:url', 'og:image']) assert.doesNotMatch(meta(k), /\/c\/[A-Za-z0-9_-]{6,}/, `${k} leaks a token`);
});

test('og:image, og:url and twitter:image are ABSOLUTE https URLs on the site origin; no placeholder survives the build', () => {
  assert.doesNotMatch(html, /\{\{/);
  assert.equal(meta('og:image'), `${SITE_ORIGIN}/og-invite.png`);
  assert.equal(meta('twitter:image'), meta('og:image'));
  assert.equal(meta('og:url'), `${SITE_ORIGIN}/c`);
  for (const k of ['og:image', 'twitter:image', 'og:url']) assert.match(meta(k), /^https:\/\/[^/]+\//, k);
});

test('the image is a real PNG, wide enough for WhatsApp to render, small enough for it not to skip', () => {
  const file = join(out, 'og-invite.png');
  assert.ok(existsSync(file), 'og-invite.png was not copied into the build');
  const buf = readFileSync(file);
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'not a PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.ok(width >= 600 && height >= 315, `too small: ${width}x${height}`); // WhatsApp's large-card minimum is 300px wide
  assert.equal(`${width}x${height}`, `${meta('og:image:width')}x${meta('og:image:height')}`, 'the declared size is the real size');
  assert.ok(Math.abs(width / height - 1.91) < 0.05, `not the 1.91:1 preview shape: ${width}x${height}`);
  assert.ok(statSync(file).size < 300 * 1024, `over 300 KB: ${statSync(file).size}`);
  assert.equal(meta('og:image:type'), 'image/png');
});

test('the tags come early in the document, where scrapers (which read only the start) will see them', () => {
  assert.ok(html.indexOf('og:image') < 5000, `og:image at byte ${html.indexOf('og:image')}`);
  assert.ok(html.indexOf('og:image') < html.indexOf('<style>'));
});

test('the same HTML is what every client gets for /c/<anything> (the rewrite serves c.html), so a scraper sees the card', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'));
  assert.deepEqual(config.hosting.rewrites, [{ source: '/c/**', destination: '/c.html' }]);
});

test('a SITE_ORIGIN that is not a bare https origin fails the build rather than shipping a broken card', () => {
  for (const bad of ['http://x.example', 'https://x.example/path', 'x.example']) {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/build-legal-site.mjs'), join(ROOT, 'legal-site/src'), join(tmpdir(), 'og-bad-out')], { env: { PATH: process.env.PATH, SITE_ORIGIN: bad }, encoding: 'utf8' });
    assert.notEqual(r.status, 0, bad);
    assert.match(r.stderr, /SITE_ORIGIN must be a bare https origin/);
  }
});

test('a real domain later is a one-variable change: the origin flows into every absolute URL', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { build } from ${JSON.stringify(join(ROOT, 'scripts/build-legal-site.mjs'))};
    import { readFileSync } from 'node:fs';
    const out = ${JSON.stringify(join(mkdtempSync(join(tmpdir(), 'og-dom-')), 'public'))};
    build(${JSON.stringify(join(ROOT, 'legal-site/src'))}, out, ${JSON.stringify(join(ROOT, 'legal-site/static'))});
    const h = readFileSync(out + '/c.html', 'utf8');
    console.log([...h.matchAll(/content="(https:\\/\\/[^"]+)"/g)].map((m) => m[1]).join('\\n'));
  `], { env: { PATH: process.env.PATH, SITE_ORIGIN: 'https://bama.example' }, encoding: 'utf8' });
  const urls = r.stdout.trim().split('\n');
  assert.deepEqual(urls.sort(), ['https://bama.example/c', 'https://bama.example/og-invite.png', 'https://bama.example/og-invite.png'].sort());
});
