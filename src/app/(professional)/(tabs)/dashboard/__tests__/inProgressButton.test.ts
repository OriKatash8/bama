import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '@core/i18n/translations/en.json';

/**
 * THE NOTICE-BOARD HEADER FITS ON ONE ROW IN ENGLISH.
 *
 * Measured in Montserrat SemiBold: "In progress" is 52.0pt at 9pt and 46.4pt
 * at 8pt; the 25pt ExtraBold "Notice Board" title is 171.1pt. On a 402pt
 * iPhone the row has 362pt: the title plus three 54pt buttons and their gaps
 * fits (357pt), and a 54pt button leaves 47pt for its label at 8pt. So every
 * button is 54pt, the English labels are 8pt, and the title and the
 * in-progress label may shrink a little on a narrower phone instead of wrapping.
 */
const src = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8');

const button = (() => {
  const i = src.indexOf('testID="noticeboard-inprogress-btn"');
  expect(i).toBeGreaterThan(-1);
  const start = src.lastIndexOf('<TouchableOpacity', i);
  return src.slice(start, src.indexOf('</TouchableOpacity>', i));
})();

const styleBlock = (name: string) => {
  const m = src.match(new RegExp(`\\n  ${name}: \\{([\\s\\S]*?)\\n?  \\},?\\n`));
  expect(m).not.toBeNull();
  return m![1];
};

it('is the button that offers "In progress"', () => {
  expect(en.noticeboard.in_progress_toggle).toBe('In progress');
  expect(button).toContain("t('noticeboard.in_progress_toggle')");
});

it('shows "In progress" on one row, shrinking a little rather than wrapping', () => {
  expect(button).toMatch(/numberOfLines=\{showInProgress \? 2 : 1\}/);
  expect(button).toContain('adjustsFontSizeToFit');
});

it('every header button is the same, slightly bigger square', () => {
  expect(button).toMatch(/style=\{styles\.navBtn\}/);
  expect(src).not.toContain('navBtnFit');
  expect(styleBlock('navBtn')).toMatch(/width: 54,/);
});

it('English labels are a size smaller; Hebrew keeps 9', () => {
  expect(styleBlock('navBtnText')).toMatch(/fontSize: 9,/);
  expect(styleBlock('navBtnTextEn')).toMatch(/fontSize: 8/);
  const uses = src.match(/styles\.navBtnText, !rtl && styles\.navBtnTextEn/g) ?? [];
  expect(uses.length).toBe(3);
});

it('the Notice Board title stays on one row', () => {
  expect(src).toMatch(/numberOfLines=\{onBoard \? 1 : undefined\}/);
});
