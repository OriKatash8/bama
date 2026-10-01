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
  const out = join(mkdtempSync(join(tmpdir(), 'legal-out-')), 'public');
  build(src, out);
  return (f) => readFileSync(join(out, f), 'utf8');
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
