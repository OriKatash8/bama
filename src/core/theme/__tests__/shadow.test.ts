import { Platform } from 'react-native';
import { ANDROID_BLUR_PER_RADIUS, parseColor, shadow } from '../shadow';

const realOS = Platform.OS;
afterEach(() => { (Platform as { OS: string }).OS = realOS; });
const firstColor = (s: ReturnType<typeof shadow>) => (s.boxShadow as unknown as { color: string }[])[0].color;
const as = (os: string) => { (Platform as { OS: string }).OS = os; };

describe('shadow() on iOS and web', () => {
  it.each(['ios', 'web'])('%s: returns exactly the shadow* props that were given', (os) => {
    as(os);
    expect(shadow({ color: '#4C1D95', opacity: 0.09, radius: 14, offsetX: 0, offsetY: -6, elevation: 6 })).toEqual({
      shadowColor: '#4C1D95',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.09,
      shadowRadius: 14,
    });
  });

  it('omits what was not given instead of inventing defaults', () => {
    as('ios');
    expect(shadow({ opacity: 0.35, radius: 28, offsetY: 12 })).toEqual({
      shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 28,
    });
    expect(shadow({ color: '#000' })).toEqual({ shadowColor: '#000' });
  });

  it('is unaffected by the android option', () => {
    as('ios');
    expect(shadow({ color: '#000', opacity: 0.2, radius: 20, elevation: 20, android: 'none' })).toEqual({
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20,
    });
  });
});

describe('shadow() on Android', () => {
  beforeEach(() => as('android'));

  it('maps to a boxShadow with the same offset, scaled blur and the opacity in the colour', () => {
    expect(shadow({ color: '#4C1D95', opacity: 0.09, radius: 14, offsetX: 0, offsetY: -6 })).toEqual({
      boxShadow: [{ offsetX: 0, offsetY: -6, blurRadius: 14 * ANDROID_BLUR_PER_RADIUS, color: 'rgba(76, 29, 149, 0.09)' }],
    });
  });

  it('keeps elevation for paint order only, with a transparent Material shadow', () => {
    const s = shadow({ color: '#000', opacity: 0.2, radius: 20, offsetY: 8, elevation: 20 });
    expect(s.elevation).toBe(20);
    expect(s.shadowColor).toBe('transparent');
    expect(s.boxShadow).toHaveLength(1);
  });

  it('draws nothing without an opacity (iOS draws nothing either)', () => {
    expect(shadow({ color: '#000', radius: 10 })).toEqual({});
  });

  it("'none' leaves the view exactly as it was on Android: elevation only, no boxShadow", () => {
    expect(shadow({ color: '#000', opacity: 0.2, radius: 20, elevation: 20, android: 'none' })).toEqual({ elevation: 20 });
    expect(shadow({ opacity: 0.2, radius: 20, android: 'none' })).toEqual({});
  });

  it('defaults the colour to black and folds a colour alpha into the opacity', () => {
    expect(firstColor(shadow({ opacity: 0.5, radius: 4 }))).toBe('rgba(0, 0, 0, 0.5)');
    expect(firstColor(shadow({ color: 'rgba(10, 20, 30, 0.5)', opacity: 0.5, radius: 4 }))).toBe('rgba(10, 20, 30, 0.25)');
  });
});

describe('parseColor', () => {
  it('reads hex, rgb(a) and the named colours used in the app', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('#1E3A8A')).toEqual([30, 58, 138, 1]);
    expect(parseColor('#00000080')?.[3]).toBeCloseTo(0.5, 2);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('black')).toEqual([0, 0, 0, 1]);
    expect(parseColor('transparent')).toEqual([0, 0, 0, 0]);
    expect(parseColor('papayawhip')).toBeNull();
  });
});
