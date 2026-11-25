import { whatsappPhone, whatsappLink } from '../whatsapp';

describe('whatsappPhone', () => {
  it.each([
    ['050-123-4567', '972501234567'],
    ['0501234567', '972501234567'],
    ['+972 50 123 4567', '972501234567'],
    ['972501234567', '972501234567'],
    ['00972501234567', '972501234567'],
    ['+972 (0)50-123-4567', '972501234567'],
    ['03-123-4567', '97231234567'],
  ])('normalises %s', (raw, expected) => {
    expect(whatsappPhone(raw)).toBe(expected);
  });

  it.each([null, undefined, '', 'abc', '12345', '+1 415 555 0100', 42])(
    'rejects %p', (raw) => {
      expect(whatsappPhone(raw)).toBeNull();
    },
  );
});

describe('whatsappLink', () => {
  it('builds a wa.me link with the Hebrew text percent-encoded', () => {
    const url = whatsappLink('050-123-4567', 'שלום דנה, ₪120');
    expect(url).toBe(`https://wa.me/972501234567?text=${encodeURIComponent('שלום דנה, ₪120')}`);
    expect(decodeURIComponent(url!.split('?text=')[1])).toBe('שלום דנה, ₪120');
  });

  it('is null without a usable phone', () => {
    expect(whatsappLink(null, 'x')).toBeNull();
  });
});
