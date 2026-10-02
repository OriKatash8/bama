import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The fee has ONE name: "עמלת תיווך" in Hebrew, "brokerage fee" in English.
 * Nothing a user reads — app translations or a push sent by a function — may
 * call it "עמלת (ה)פלטפורמה" or "platform fee". Comments are not user text and
 * are stripped first.
 */

const ROOT = join(__dirname, '..', '..', '..');
const WRONG = /עמלת\s+ה?פלטפורמה|platform\s+fee/i;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : tsFiles(p);
    return n.endsWith('.ts') ? [p] : [];
  });
}

it('no app translation names it "platform fee" / "עמלת פלטפורמה"', () => {
  for (const lang of ['he', 'en']) {
    const text = readFileSync(join(ROOT, 'src/core/i18n/translations', `${lang}.json`), 'utf8');
    expect(text).not.toMatch(WRONG);
  }
});

it('no string a function sends names it "platform fee" / "עמלת פלטפורמה"', () => {
  const offenders = tsFiles(join(ROOT, 'functions/src'))
    .filter((f) => WRONG.test(stripComments(readFileSync(f, 'utf8'))));
  expect(offenders).toEqual([]);
});

it('the three overdue pushes say "עמלת התיווך" / "brokerage fee"', () => {
  const src = stripComments(readFileSync(join(ROOT, 'functions/src/lifecycle/feeOverdue.ts'), 'utf8'));
  const block = src.slice(src.indexOf('const NOTICE_TEXT'), src.indexOf('async function langOf'));
  const he = [...block.matchAll(/he: \(a\) => `([^`]*)`/g)].map((m) => m[1]);
  const en = [...block.matchAll(/en: \(a\) => `([^`]*)`/g)].map((m) => m[1]);
  expect(he).toHaveLength(3);
  expect(en).toHaveLength(3);
  for (const t of he) expect(t).toContain('עמלת התיווך');
  for (const t of en) expect(t).toContain('brokerage fee');
});
