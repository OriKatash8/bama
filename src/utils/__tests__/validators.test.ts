import { isValidEmail, isValidPhone, isValidUrl, isNonEmpty, isWithinLength } from '../validators';

describe('isValidEmail', () => {
  it('accepts standard emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user+tag@domain.co.uk')).toBe(true);
  });
  it('rejects malformed emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts valid phone numbers', () => {
    expect(isValidPhone('+1 555 123 4567')).toBe(true);
    expect(isValidPhone('555-123-4567')).toBe(true);
  });
  it('rejects strings that are too short', () => {
    expect(isValidPhone('123')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://sub.domain.org/path')).toBe(true);
  });
  it('rejects non-URL strings', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('isNonEmpty', () => {
  it('returns true for non-whitespace strings', () => {
    expect(isNonEmpty('hello')).toBe(true);
  });
  it('returns false for empty or whitespace-only strings', () => {
    expect(isNonEmpty('')).toBe(false);
    expect(isNonEmpty('   ')).toBe(false);
  });
});

describe('isWithinLength', () => {
  it('returns true when at or under the limit', () => {
    expect(isWithinLength('hello', 10)).toBe(true);
    expect(isWithinLength('hello', 5)).toBe(true);
  });
  it('returns false when over the limit', () => {
    expect(isWithinLength('hello world', 5)).toBe(false);
  });
});
