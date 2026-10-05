// node --test scripts/__tests__/inviteLandingPage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { isInviteTokenOrCode } from '../../src/core/deepLinks/allowlist.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(ROOT, 'legal-site/static/c.html'), 'utf8');
const config = JSON.parse(readFileSync(join(ROOT, 'firebase.json'), 'utf8'));

const TOKEN = 'abcDEF123_-xyzABC456789'.slice(0, 22);
const CODE = 'K7MX9P';

/** Runs the page's inline script against a tiny fake document at `pathname`. */
function run(pathname) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const el = (id) => ({ id, hidden: undefined, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const els = { open: el('open'), valid: el('valid'), invalid: el('invalid') };
  vm.runInNewContext(script, {
    location: { pathname },
    document: { getElementById: (id) => els[id] },
  });
  return els;
}

test('a valid token builds the bama://c/<token> button and shows the invite', () => {
  const els = run(`/c/${TOKEN}`);
  assert.equal(els.open.attrs.href, `bama://c/${TOKEN}`);
  assert.equal(els.valid.hidden, false);
  assert.equal(els.invalid.hidden, true);
});

test('a 6-character code works the same way', () => {
  const els = run(`/c/${CODE}`);
  assert.equal(els.open.attrs.href, `bama://c/${CODE}`);
  assert.equal(els.valid.hidden, false);
});

test('anything else shows the "link looks wrong" state and builds NO link', () => {
  for (const path of [
    '/c/', '/c', '/c/short', `/c/${TOKEN}/extra`, `/c/${TOKEN}x`, '/c/javascript:alert(1)',
    '/c/' + 'a'.repeat(21), '/c/' + 'a b'.padEnd(22, 'c'), '/x/' + TOKEN, '/c/%3Cscript%3E' + 'a'.repeat(8),
  ]) {
    const els = run(path);
    assert.equal(els.open.attrs.href, undefined, `built a link for ${path}`);
    assert.equal(els.valid.hidden, true, path);
    assert.equal(els.invalid.hidden, false, path);
  }
});

test('its token pattern is EXACTLY the app\'s (allowlist.ts): same accepts, same rejects', () => {
  const samples = [
    TOKEN, CODE, 'K7MX9O', 'k7mx9p', 'K7MX9', 'K7MX9PP', 'a'.repeat(22), 'a'.repeat(21), 'a'.repeat(23),
    'A_-' + 'b'.repeat(19), 'a.b' + 'c'.repeat(19), '', 'ABC234', 'ABC10I', '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
  ];
  for (const s of samples) {
    const page = run(`/c/${s}`).valid.hidden === false;
    assert.equal(page, isInviteTokenOrCode(s), `page and app disagree on "${s}"`);
  }
});

test('it reaches nowhere: no external URLs, no fetch/XHR, no third-party assets, no referrer, not indexed', () => {
  assert.doesNotMatch(html, /https?:\/\//i, 'an absolute http(s) URL appeared');
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage/i);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /<link[^>]+stylesheet/i, 'a stylesheet would be a request that carries the token');
});

test('Hebrew first (rtl) with English alongside; the open button carries both', () => {
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /פתיחה באפליקציה/);
  assert.match(html, /Open in the app/);
});

test('hosting rewrites /c/** to the page, and adds noindex + no-referrer headers for it', () => {
  const h = config.hosting;
  assert.deepEqual(h.rewrites, [{ source: '/c/**', destination: '/c.html' }]);
  const rule = h.headers.find((x) => x.source === '/c/**');
  assert.ok(rule, 'no header rule for /c/**');
  const map = Object.fromEntries(rule.headers.map((x) => [x.key, x.value]));
  assert.equal(map['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(map['Referrer-Policy'], 'no-referrer');
});

test('the rewrite is only for /c/**: the legal pages are not swallowed', () => {
  for (const r of config.hosting.rewrites) assert.equal(r.source, '/c/**');
});
