import { familyFor, isBrandFamily, resolveTextStyle, scriptOf, weightNumber } from '../fonts';

describe('weightNumber', () => {
  it('reads names, numbers and strings, rounded and clamped', () => {
    expect(weightNumber(undefined)).toBe(400);
    expect(weightNumber('normal')).toBe(400);
    expect(weightNumber('bold')).toBe(700);
    expect(weightNumber('600')).toBe(600);
    expect(weightNumber(800 as never)).toBe(800);
    expect(weightNumber('650' as never)).toBe(700);
    expect(weightNumber('1000' as never)).toBe(900);
    expect(weightNumber('100')).toBe(100);
  });
});

describe('familyFor', () => {
  it('names a static Heebo face for every weight', () => {
    expect([100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => familyFor('he', w))).toEqual([
      'Heebo-Thin', 'Heebo-ExtraLight', 'Heebo-Light', 'Heebo-Regular', 'Heebo-Medium',
      'Heebo-SemiBold', 'Heebo-Bold', 'Heebo-ExtraBold', 'Heebo-Black',
    ]);
  });

  it('names a static Montserrat face, Light standing in for Thin and ExtraLight', () => {
    expect([100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => familyFor('en', w))).toEqual([
      'Montserrat-Light', 'Montserrat-Light', 'Montserrat-Light', 'Montserrat-Regular', 'Montserrat-Medium',
      'Montserrat-SemiBold', 'Montserrat-Bold', 'Montserrat-ExtraBold', 'Montserrat-Black',
    ]);
  });
});

describe('scriptOf / isBrandFamily', () => {
  it('Hebrew letters pick Heebo, anything else Montserrat', () => {
    expect(scriptOf('שלום')).toBe('he');
    expect(scriptOf('Hello שלום')).toBe('he');
    expect(scriptOf('Hello 123')).toBe('en');
    expect(scriptOf('')).toBe('en');
  });
  it('recognises only our static families', () => {
    expect(isBrandFamily('Heebo-Bold')).toBe(true);
    expect(isBrandFamily('Montserrat-SemiBold')).toBe(true);
    expect(isBrandFamily('Montserrat')).toBe(false);
    expect(isBrandFamily('PeaceSans')).toBe(false);
    expect(isBrandFamily(undefined)).toBe(false);
  });
});

describe('resolveTextStyle', () => {
  it('gives plain text the regular face of its script', () => {
    expect(resolveTextStyle({}, 'Hello')).toEqual({ fontFamily: 'Montserrat-Regular' });
    expect(resolveTextStyle({}, 'שלום')).toEqual({ fontFamily: 'Heebo-Regular' });
  });

  it('turns a plain fontWeight into the matching face and cancels the weight', () => {
    expect(resolveTextStyle({ fontWeight: '700' }, 'Hello')).toEqual({ fontFamily: 'Montserrat-Bold', fontWeight: undefined });
    expect(resolveTextStyle({ fontWeight: 'bold' }, 'שלום')).toEqual({ fontFamily: 'Heebo-Bold', fontWeight: undefined });
  });

  it("keeps a family's own script and lets an explicit weight pick its face (iOS-variable behaviour)", () => {
    expect(resolveTextStyle({ fontFamily: 'Montserrat-Bold', fontWeight: '800' }, 'x')).toEqual({ fontFamily: 'Montserrat-ExtraBold', fontWeight: undefined });
    expect(resolveTextStyle({ fontFamily: 'Heebo-ExtraBold', fontWeight: '800' }, 'Latin')).toEqual({ fontFamily: 'Heebo-ExtraBold', fontWeight: undefined });
  });

  it('leaves a brand family without a weight exactly as given', () => {
    expect(resolveTextStyle({ fontFamily: 'Heebo-Medium' }, 'x')).toEqual({});
  });

  it('never touches another font (PeaceSans, system fonts), weight included', () => {
    expect(resolveTextStyle({ fontFamily: 'PeaceSans', fontWeight: '700' }, 'x')).toEqual({});
  });
});
