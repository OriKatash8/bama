// node --test scripts/__tests__/*.test.mjs
//
// /pay-return is Grow's successUrl. It must be a courtesy page only: a fixed
// destination, the agreed Hebrew text, and no way to tell the server anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(root, 'legal-site/static/pay-return.html'), 'utf8');
const live = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const hosting = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8')).hosting;

test('shows the agreed Hebrew copy and a visible back-to-app button', () => {
  assert.match(html, /חוזרים לאפליקציה…/);
  assert.match(html, /אם התשלום הושלם, הוא יתעדכן תוך כמה דקות\./);
  assert.match(html, /<a class="open" href="bama:\/\/settings\/payment">חזרה לאפליקציה/);
});

test('redirects only to the fixed destination and reads nothing from its address', () => {
  assert.match(script, /location\.replace\('bama:\/\/settings\/payment'\)/);
  assert.doesNotMatch(script, /location\.(search|hash|href|pathname)|URLSearchParams|document\.cookie/);
});

test('cannot report anything: no network calls, no forms, no external requests', () => {
  assert.doesNotMatch(live, /fetch\(|XMLHttpRequest|sendBeacon|<form|<iframe|<img[^>]+src="https?:/);
  assert.doesNotMatch(live, /paymentLinkConfirm|cloudfunctions|settle/i);
});

test('is not indexed and sends no referrer', () => {
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  const h = hosting.headers.find((x) => x.source === '/pay-return');
  assert.ok(h);
  assert.deepEqual(h.headers.map((x) => x.key).sort(), ['Cache-Control', 'Referrer-Policy', 'X-Robots-Tag']);
});
