import { normalizePhone, formatPhoneForDisplay, isE164 } from '../phone';

/**
 * Phone numbers are checked by FORMAT only (no SMS) and stored normalised as
 * E.164, so one number is always one string. Israeli local numbers — how almost
 * everyone here types them — become +972 without the leading 0.
 */

describe('normalizePhone', () => {
  it.each([
    ['0501234567', '+972501234567'],
    ['050-123-4567', '+972501234567'],
    ['050 123 4567', '+972501234567'],
    ['(050) 1234567', '+972501234567'],
    ['+972 50-123-4567', '+972501234567'],
    ['+972501234567', '+972501234567'],
    ['972501234567', '+972501234567'],
    ['03-1234567', '+97231234567'],
    ['+1 415 555 2671', '+14155552671'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('%s → %s', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it.each([
    '', '   ', 'abc', '050123456', '05012345678', '1234567', '+12', '+0501234567',
    '+1234567890123456', '050-12a-4567', '0012345678',
  ])('rejects %p', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it.each([
    ['\u202A050-123-4567\u202C', 'iOS bidi embedding (autofill in Hebrew)'],
    ['\u200E050\u00A0123\u00A04567', 'LRM + non-breaking spaces'],
    ['050\u2011123\u20114567', 'non-breaking hyphens (contact card)'],
    ['050\u2013123\u20144567', 'en / em dashes'],
    ['\u2066+972\u00A050\u2011123\u20114567\u2069', 'isolates around +972'],
    ['\uFF10\uFF15\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17', 'full-width digits'],
  ])('tolerates invisible / look-alike characters: %p (%s)', (input) => {
    expect(normalizePhone(input)).toBe('+972501234567');
  });

  it('+972 followed by a leading 0 still normalises', () => {
    expect(normalizePhone('+972 050 123 4567')).toBe('+972501234567');
  });
});

describe('isE164', () => {
  it('matches exactly what the rules accept', () => {
    expect(isE164('+972501234567')).toBe(true);
    expect(isE164('0501234567')).toBe(false);
    expect(isE164('+0123456789')).toBe(false);
  });
});

describe('formatPhoneForDisplay', () => {
  it('shows an Israeli number the local way', () => {
    expect(formatPhoneForDisplay('+972501234567')).toBe('050-123-4567');
    expect(formatPhoneForDisplay('+97231234567')).toBe('03-123-4567');
  });
  it('leaves an international number in its + form', () => {
    expect(formatPhoneForDisplay('+14155552671')).toBe('+14155552671');
  });
});
