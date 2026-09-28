import { normalizeCourseUrl } from '../courseUrl';

describe('normalizeCourseUrl', () => {
  it('keeps a full web address, trimmed', () => {
    expect(normalizeCourseUrl('  https://gaffer.school/c?id=1  ')).toBe('https://gaffer.school/c?id=1');
    expect(normalizeCourseUrl('http://gaffer.school')).toBe('http://gaffer.school');
  });

  it('adds https:// when the scheme is missing, or the button could not open it', () => {
    expect(normalizeCourseUrl('gaffer.school/c')).toBe('https://gaffer.school/c');
    expect(normalizeCourseUrl('www.gaffer.school')).toBe('https://www.gaffer.school');
  });

  it('empty means no link (no button)', () => {
    expect(normalizeCourseUrl('')).toBe('');
    expect(normalizeCourseUrl('   ')).toBe('');
  });

  it('refuses what is not a web address', () => {
    expect(normalizeCourseUrl('not a link')).toBeNull();
    expect(normalizeCourseUrl('gaffer')).toBeNull();
    expect(normalizeCourseUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeCourseUrl('ftp://gaffer.school')).toBeNull();
    expect(normalizeCourseUrl('https://')).toBeNull();
  });
});
