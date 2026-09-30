import { containsPhoneNumber, findPhoneNumbers, RULES_PHONE_PATTERN } from '../contactFilter';

/**
 * No contact details before hire (Terms §6.8): public profile text may not carry
 * a phone number. The same pattern is enforced by firestore.rules (hasNoPhone);
 * contactRulesSync.test.ts pins the rules copy.
 */

const SHOULD_MATCH = [
  '0521234567',
  '052-123-4567',
  '052 123 45 67',
  '05 2 1 2 3 4 5 6 7',
  '052.123.4567',
  '(052)1234567',
  '+972521234567',
  '+972-52-123-4567',
  '972 52 123 4567',
  '03-1234567',
  '1-700-123-456',
  'צלמו אלי 054-7654321',
  '０５２１２３４５６７', // fullwidth digits
];

const SHOULD_NOT_MATCH = [
  'Sony 24-70mm f/2.8',
  'מחיר ₪1,500 ליום',
  'A7S III + 3 סוללות',
  'צילום 4K 120fps',
  'ניסיון מ-2015',
  '2 מיקרופונים, 3 תאורות 1200W',
  'חצובה 180 ס״מ',
];

describe.each(SHOULD_MATCH)('flags %s', (text) => {
  it('containsPhoneNumber', () => expect(containsPhoneNumber(text)).toBe(true));
  it('findPhoneNumbers returns it', () => expect(findPhoneNumbers(text).length).toBeGreaterThan(0));
});

describe.each(SHOULD_NOT_MATCH)('leaves %s alone', (text) => {
  it('containsPhoneNumber', () => expect(containsPhoneNumber(text)).toBe(false));
  it('findPhoneNumbers is empty', () => expect(findPhoneNumbers(text)).toEqual([]));
});

it('also catches the other international and service forms', () => {
  expect(containsPhoneNumber('00972521234567')).toBe(true);
  expect(containsPhoneNumber('+972 0 52 123 4567')).toBe(true);
  expect(containsPhoneNumber('1-800-123-456')).toBe(true);
  expect(containsPhoneNumber('1599 123 456')).toBe(true);
  expect(containsPhoneNumber('02-6234567')).toBe(true);
});

it('sees through Arabic-Indic digits and zero-width characters', () => {
  expect(containsPhoneNumber('٠٥٢١٢٣٤٥٦٧')).toBe(true);
  expect(containsPhoneNumber('05\u200B2-123\u200D4567')).toBe(true);
});

it('returns the number as written, for highlighting', () => {
  expect(findPhoneNumbers('call 052-123-4567 or 03-1234567 today')).toEqual(['052-123-4567', '03-1234567']);
});

it('does not flag a number that is part of a longer digit run', () => {
  expect(containsPhoneNumber('serial 1052123456789')).toBe(false);
});

it('handles empty and non-text input', () => {
  expect(containsPhoneNumber('')).toBe(false);
  expect(findPhoneNumbers('')).toEqual([]);
});

describe('the rules copy (RE2, ASCII only)', () => {
  // RE2 → JS for testing: drop the inline (?s) flag (JS has no inline flags; the
  // 's' flag below does the same) and swap the POSIX class for \s.
  const asRe2 = new RegExp(
    `^${RULES_PHONE_PATTERN.replace(/^\(\?s\)/, '').replace(/\[\[:space:\]/g, '[\\s')}$`,
    's',
  );

  it('has no backslashes (rules string literals) and matches whole strings', () => {
    expect(RULES_PHONE_PATTERN).not.toContain('\\');
    expect(RULES_PHONE_PATTERN.startsWith('(?s).*')).toBe(true);
  });

  it.each(SHOULD_MATCH.filter((t) => /^[\x00-\x7F֐-׿\s]*$/.test(t)))('rules pattern flags %s', (t) => {
    expect(asRe2.test(t)).toBe(true);
  });

  it.each(SHOULD_NOT_MATCH)('rules pattern leaves %s alone', (t) => {
    expect(asRe2.test(t)).toBe(false);
  });
});
