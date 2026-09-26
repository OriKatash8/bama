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
