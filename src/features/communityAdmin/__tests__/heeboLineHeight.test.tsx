import fs from 'fs';
import path from 'path';
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { HEEBO_LINE_EM } from '../theme';
import { StatTile } from '../components/StatTiles';

jest.mock('react-native-reanimated', () => require('../../../testing/reanimatedMock').reanimatedMock());
jest.mock('@core/stores/settingsStore', () => ({
  useSettingsStore: (s: (x: { language: string }) => unknown) => s({ language: 'en' }),
}));

/**
 * On iOS a `lineHeight` below the font's own line height cuts the TOP of the
 * glyphs: React Native only re-centres text when the line is taller than the
 * font (RCTAttributedTextUtils.mm), and TextKit takes the missing height off
 * the top. Heebo's line is 1.47em (hhea 2146 + 862 over 2048), so the stat
 * tiles' 34pt numbers in a 36pt line lost the tops of their digits.
 */
it('Heebo line height matches the font file', () => {
  expect(HEEBO_LINE_EM).toBeCloseTo((2146 + 862) / 2048, 5);
});

it("a stat tile's number gets Heebo's full line box", () => {
  const r = render(<StatTile testID="t" label="Users" value={1234} caption="All time" />);
  const s = StyleSheet.flatten(r.getByTestId('t-value').props.style);
  if (s.lineHeight !== undefined) expect(s.lineHeight).toBeGreaterThanOrEqual(s.fontSize * HEEBO_LINE_EM);
});

const repo = path.join(__dirname, '../../../..');
const files: string[] = [];
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '__tests__') continue;
    const full = path.join(d, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e.name)) files.push(full);
  }
};
['src/features/communityAdmin', 'src/features/admin', 'src/app/admin'].forEach((d) => walk(path.join(repo, d)));

it.each(files.map((f) => [path.relative(repo, f)]))('%s sets no line height that clips Heebo', (rel) => {
  const src = fs.readFileSync(path.join(repo, rel), 'utf8');
  const tight = [...src.matchAll(/fontSize:\s*([\d.]+)[^}]*?lineHeight:\s*([\d.]+)/g)]
    .filter((m) => Number(m[2]) < Number(m[1]) * HEEBO_LINE_EM)
    .map((m) => m[0]);
  expect(tight).toEqual([]);
});
