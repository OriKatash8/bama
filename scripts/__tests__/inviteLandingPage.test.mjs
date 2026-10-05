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

const IDS = ['open', 'valid', 'invalid', 'get-app', 'stores', 'no-stores', 'store-ios', 'store-android'];

/**
 * Runs the page's inline script against a tiny fake document at `pathname`.
 * `appLinks` is what /app-links.json answers: an object, or an Error to simulate a failure,
 * or 'missing' for a 404. The fetch calls it made are returned in `calls`.
 */
function run(pathname, appLinks = 'missing') {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const el = (id) => ({ id, hidden: undefined, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const els = Object.fromEntries(IDS.map((id) => [id, el(id)]));
  const calls = [];
  const fetchStub = (url, opts) => {
    calls.push({ url, opts });
    if (appLinks instanceof Error) return Promise.reject(appLinks);
    if (appLinks === 'missing') return Promise.resolve({ ok: false, json: async () => { throw new Error('404 page'); } });
    return Promise.resolve({ ok: true, json: async () => appLinks });
  };
  vm.runInNewContext(script, {
    location: { pathname },
    document: { getElementById: (id) => els[id] },
    fetch: fetchStub,
    URL,
  });
  els.calls = calls;
  return els;
}
/** Lets the page's promise chain finish. */
const settle = () => new Promise((r) => setImmediate(r));

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

test('it reaches nowhere but its own /app-links.json: no external URLs, no other requests, no third-party assets, no referrer, not indexed', () => {
  // The only absolute URL allowed is the "https://" prefix check on store links.
  const withoutPrefixCheck = html.replace(/indexOf\('https:\/\/'\)/g, '').replace(/'https:'/g, '');
  assert.doesNotMatch(withoutPrefixCheck, /https?:\/\//i, 'an absolute http(s) URL appeared');
  assert.equal((html.match(/\bfetch\s*\(/g) ?? []).length, 1, 'more than one fetch');
  assert.match(html, /fetch\('\/app-links\.json', \{ cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' \}\)/);
  assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon|WebSocket|document\.cookie|localStorage|navigator\.send/i);
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
  const json = h.headers.find((x) => x.source === '/app-links.json');
  assert.ok(json, 'no header rule for /app-links.json');
  assert.deepEqual(json.headers, [{ key: 'Cache-Control', value: 'no-cache' }]);
  const rule = h.headers.find((x) => x.source === '/c/**');
  assert.ok(rule, 'no header rule for /c/**');
  const map = Object.fromEntries(rule.headers.map((x) => [x.key, x.value]));
  assert.equal(map['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(map['Referrer-Policy'], 'no-referrer');
});

test('a valid link asks /app-links.json (same origin, no credentials) and nothing else; a bad one asks nothing', async () => {
  const ok = run(`/c/${TOKEN}`, { iosUrl: '', androidUrl: '' });
  await settle();
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].url, '/app-links.json');
  assert.equal(ok.calls[0].opts.credentials, 'omit');
  assert.ok(!ok.calls[0].url.includes(TOKEN), 'the token must not be in the request');
  const bad = run('/c/not-a-token');
  await settle();
  assert.equal(bad.calls.length, 0);
  assert.equal(bad['get-app'].hidden, undefined, 'the stores area is not touched for a bad link');
});

test('app not in the stores yet (empty URLs): says so, honestly, and offers no store buttons', async () => {
  const els = run(`/c/${TOKEN}`, { iosUrl: '', androidUrl: '' });
  await settle();
  assert.equal(els['get-app'].hidden, false);
  assert.equal(els['no-stores'].hidden, false);
  assert.equal(els.stores.hidden, true);
  assert.equal(els['store-ios'].hidden, true);
  assert.equal(els['store-android'].hidden, true);
  assert.equal(els['store-ios'].attrs.href, undefined);
  assert.match(html, /האפליקציה של BAMA עדיין לא זמינה בחנויות האפליקציות/);
});

test('both store links seeded: both buttons appear, with exactly those URLs, no code change', async () => {
  const els = run(`/c/${TOKEN}`, { iosUrl: 'https://apps.apple.com/app/id123', androidUrl: 'https://play.google.com/store/apps/details?id=com.bamaapp.bama' });
  await settle();
  assert.equal(els.stores.hidden, false);
  assert.equal(els['no-stores'].hidden, true);
  assert.equal(els['store-ios'].hidden, false);
  assert.equal(els['store-android'].hidden, false);
  assert.equal(els['store-ios'].attrs.href, 'https://apps.apple.com/app/id123');
  assert.equal(els['store-android'].attrs.href, 'https://play.google.com/store/apps/details?id=com.bamaapp.bama');
});

test('only one store seeded: only that button', async () => {
  const els = run(`/c/${TOKEN}`, { iosUrl: 'https://apps.apple.com/app/id123', androidUrl: '' });
  await settle();
  assert.equal(els['store-ios'].hidden, false);
  assert.equal(els['store-android'].hidden, true);
  assert.equal(els.stores.hidden, false);
  assert.equal(els['no-stores'].hidden, true);
});

test('only https store links become buttons (javascript:, http:, credentials, junk are refused)', async () => {
  for (const bad of ['javascript:alert(1)', 'http://apps.apple.com/x', 'https://user:pw@evil.example/x', 'data:text/html,x', '//evil.example', 'bama://c/x', 42, null, {}]) {
    const els = run(`/c/${TOKEN}`, { iosUrl: bad, androidUrl: bad });
    await settle();
    assert.equal(els['store-ios'].attrs.href, undefined, `rendered ${String(bad)}`);
    assert.equal(els['store-android'].attrs.href, undefined);
    assert.equal(els['no-stores'].hidden, false, `did not fall back to the honest message for ${String(bad)}`);
  }
});

test('no file (404), a network error, or garbage: the honest message, never a blank area', async () => {
  for (const answer of ['missing', new Error('offline'), null, 'a string', []]) {
    const els = run(`/c/${TOKEN}`, answer);
    await settle();
    assert.equal(els['get-app'].hidden, false, `blank for ${String(answer)}`);
    assert.equal(els['no-stores'].hidden, false);
    assert.equal(els.stores.hidden, true);
  }
});

test('the open-in-app button does not wait for the stores request', () => {
  const els = run(`/c/${TOKEN}`, { iosUrl: '', androidUrl: '' });
  // Synchronously, before the fetch has answered:
  assert.equal(els.open.attrs.href, `bama://c/${TOKEN}`);
  assert.equal(els.valid.hidden, false);
  assert.equal(els['get-app'].hidden, undefined, 'the stores area waits for its answer instead of flashing');
});

test('"Open in the app" is a real <a href="bama://c/..."> the user taps, never a redirect or an automatic attempt', () => {
  // The element: a plain anchor (not a button or a div with a handler).
  assert.match(html, /<a id="open" class="open" href="#">/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  // The script may READ location.pathname and nothing else about navigation.
  const withoutComments = script.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual(withoutComments.match(/\blocation\b[^;\n]*/g), ['location.pathname.split(\'/\')']);
  assert.doesNotMatch(withoutComments, /window\.|\.click\(|\.submit\(|setTimeout|setInterval|requestAnimationFrame|\.assign\(|\.replace\(|\.open\(|\bhistory\./);
  assert.doesNotMatch(html, /http-equiv\s*=\s*["']?refresh/i);
  assert.doesNotMatch(html, /\bonload\s*=|\bonclick\s*=/i);
  // The only thing done with the scheme URL is putting it in the anchor's href.
  assert.equal((withoutComments.match(/bama:\/\//g) ?? []).length, 1);
  assert.match(withoutComments, /getElementById\('open'\)\.setAttribute\('href', 'bama:\/\/c\/' \+ token\)/);
});

test('running the page never navigates: a location that records any write sees none', () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const writes = [];
  const location = new Proxy({ pathname: `/c/${TOKEN}` }, { set(_t, k, v) { writes.push([k, v]); return true; } });
  const el = (id) => ({ id, hidden: undefined, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const els = Object.fromEntries(IDS.map((id) => [id, el(id)]));
  vm.runInNewContext(script, { location, document: { getElementById: (id) => els[id] }, fetch: () => new Promise(() => {}), URL });
  assert.deepEqual(writes, []);
  assert.equal(els.open.attrs.href, `bama://c/${TOKEN}`);
});

test('the fallback is visible next to the button, in Hebrew and English: open this page in Safari/Chrome', () => {
  const validSection = html.slice(html.indexOf('<section id="valid"'), html.indexOf('<section id="invalid"'));
  assert.ok(validSection.indexOf('id="open"') < validSection.indexOf('id="fallback"'), 'the fallback comes right after the button');
  assert.match(validSection, /אם לא קרה כלום, פתח את הדף הזה בדפדפן: Safari או Chrome/);
  assert.match(validSection, /If nothing happened, open this page in Safari or Chrome/);
  // Not inside any block that is hidden once the stores answer.
  assert.ok(validSection.indexOf('id="fallback"') < validSection.indexOf('id="get-app"'));
});

test('the rewrite is only for /c/**: the legal pages are not swallowed', () => {
  for (const r of config.hosting.rewrites) assert.equal(r.source, '/c/**');
});
