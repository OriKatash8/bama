import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The brokerage balance page's title is black, like the other settings pages. */
const SRC = readFileSync(join(__dirname, '..', 'payment.tsx'), 'utf8');

it('the title style is black', () => {
  const m = SRC.match(/\n  title: \{([^}]*)\}/);
  expect(m).not.toBeNull();
  expect(m![1]).toMatch(/color: '#000000'/);
});

it('the page title renders balance.title with that style', () => {
  expect(SRC).toMatch(/<AppText weight="bold" style=\{styles\.title\}>\s*\{t\('balance\.title'\)\}/);
});

it('the "Total due" label is black too', () => {
  const i = SRC.indexOf("{t('balance.total_label')}");
  expect(i).toBeGreaterThan(-1);
  const tag = SRC.slice(SRC.lastIndexOf('<AppText', i), i);
  expect(tag).toContain("color: '#000000'");
  expect(tag).not.toContain('textMuted');
});
