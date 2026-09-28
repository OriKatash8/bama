import { CURRENT_TERMS_VERSION, compareTermsVersions, isTermsVersionCurrent } from '../legal';

describe('terms versions', () => {
  it('compares dotted versions number by number', () => {
    expect(compareTermsVersions('1.10', '1.9')).toBe(1);
    expect(compareTermsVersions('1.0', '1')).toBe(0);
    expect(compareTermsVersions('0.9', '1.0')).toBe(-1);
    expect(compareTermsVersions('2', '1.99')).toBe(1);
  });

  it('the current version is current; older, missing or unreadable ones are not', () => {
    expect(isTermsVersionCurrent(CURRENT_TERMS_VERSION)).toBe(true);
    expect(isTermsVersionCurrent('0.9')).toBe(false);
    expect(isTermsVersionCurrent(undefined)).toBe(false);
    expect(isTermsVersionCurrent(null)).toBe(false);
    expect(isTermsVersionCurrent('')).toBe(false);
    expect(isTermsVersionCurrent('v1')).toBe(false);
  });

  it('a version newer than the current one is accepted', () => {
    expect(isTermsVersionCurrent('99.0')).toBe(true);
  });
});
