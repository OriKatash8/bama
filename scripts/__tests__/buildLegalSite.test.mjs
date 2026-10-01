// node --test scripts/__tests__/*.test.mjs
//
// The legal site is four fixed URLs quoted inside the Terms, so the build must
// write exactly these files, in the right language and direction, with Hebrew
// as text (not entities) and tables that scroll on a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../build-legal-site.mjs';

function fixture() {
  const src = mkdtempSync(join(tmpdir(), 'legal-src-'));
  const table = '\n\n| עמודה | ערך |\n|---|---|\n| א | ב |\n';
  writeFileSync(join(src, 'terms.he.md'), `# תקנון ותנאי שימוש\n\nשלום **עולם** & <חברים>${table}`);
  writeFileSync(join(src, 'privacy.he.md'), '# מדיניות פרטיות\n\nפרטיות.');
  writeFileSync(join(src, 'terms.en.md'), '# Terms of Use\n\nHello.');
  writeFileSync(join(src, 'privacy.en.md'), '# Privacy Policy\n\nPrivate.');
  const stat = mkdtempSync(join(tmpdir(), 'legal-static-'));
  for (const f of ['logo-light.webp', 'logo-dark.png', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png']) writeFileSync(join(stat, f), 'x');
  const out = join(mkdtempSync(join(tmpdir(), 'legal-out-')), 'public');
  build(src, out, stat);
  const read = (f) => readFileSync(join(out, f), 'utf8');
  read.exists = (f) => existsSync(join(out, f));
  return read;
}

const read = fixture();

test('writes the four pages at their fixed paths, plus an index linking all four', () => {
  const index = read('index.html');
  for (const p of ['/terms', '/privacy', '/en/terms', '/en/privacy']) assert.match(index, new RegExp(`href="${p}"`));
});

test('Hebrew pages are rtl Hebrew with Hebrew text, not entities', () => {
  const html = read('terms.html');
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /<h1[^>]*>תקנון ותנאי שימוש<\/h1>/);
  assert.match(html, /שלום <strong>עולם<\/strong>/);
  assert.doesNotMatch(html, /&#x5[0-9a-f]{2};|&#1[45]\d\d;/i);
  assert.match(read('privacy.html'), /<html lang="he" dir="rtl">/);
});

test('English pages are ltr', () => {
  assert.match(read('en/terms.html'), /<html lang="en" dir="ltr">/);
  assert.match(read('en/privacy.html'), /<html lang="en" dir="ltr">/);
});

test('each page links to the same document in the other language', () => {
  assert.match(read('terms.html'), /href="\/en\/terms"/);
  assert.match(read('en/terms.html'), /href="\/terms"/);
  assert.match(read('privacy.html'), /href="\/en\/privacy"/);
  assert.match(read('en/privacy.html'), /href="\/privacy"/);
});

test('has a title, a description, and no script', () => {
  for (const f of ['terms.html', 'privacy.html', 'en/terms.html', 'en/privacy.html', 'index.html']) {
    const html = read(f);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.doesNotMatch(html, /<script/i);
  }
});

test('tables are wrapped so they scroll horizontally', () => {
  assert.match(read('terms.html'), /<div class="table-wrap"><table>/);
});

test('static files (logo, favicons) are copied next to the pages', () => {
  for (const f of ['logo-light.webp', 'logo-dark.png', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png']) {
    assert.ok(read.exists(f), f);
  }
});

const LOGO = /<a class="home" href="\/"><picture class="logo[^"]*">\s*<source srcset="\/logo-dark\.png" media="\(prefers-color-scheme: dark\)">\s*<img src="\/logo-light\.webp" alt="BAMA" width="\d+" height="(\d+)">\s*<\/picture><\/a>/;

test('every page header starts with the logo, linking home, light/dark by color scheme, next to the title', () => {
  for (const f of ['terms.html', 'privacy.html', 'en/terms.html', 'en/privacy.html']) {
    const header = read(f).match(/<header>[\s\S]*?<\/header>/)[0];
    const m = header.match(LOGO);
    assert.ok(m, f);
    assert.equal(m[1], '36');
    assert.ok(header.indexOf('class="home"') < header.indexOf('hreflang'), `${f}: logo before the language link`);
  }
  assert.match(read('terms.html'), /<\/picture><\/a><span>תקנון ותנאי שימוש<\/span>/);
});

test('the index shows the logo large above the links', () => {
  const html = read('index.html');
  const m = html.match(LOGO);
  assert.ok(m);
  assert.equal(m[1], '88');
  assert.ok(html.indexOf('logo-index') < html.indexOf('class="pages"'));
});

test('every page has the favicon and apple-touch-icon', () => {
  for (const f of ['terms.html', 'privacy.html', 'en/terms.html', 'en/privacy.html', 'index.html']) {
    const html = read(f);
    assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="any">/);
    assert.match(html, /<link rel="icon" href="\/favicon-32\.png" type="image\/png" sizes="32x32">/);
    assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
  }
});
