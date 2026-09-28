import { groupedBars, regNiceMax } from '../geometry';

const INS = { left: 28, right: 10, top: 18, bottom: 26 };

describe('groupedBars', () => {
  it('puts the client and pro bars side by side inside their band, never overlapping', () => {
    const g = groupedBars(7, 360, INS);
    for (let i = 0; i < 7; i++) {
      const bandStart = INS.left + g.band * i;
      expect(g.firstX(i)).toBeGreaterThanOrEqual(bandStart);
      expect(g.firstX(i) + g.barW).toBeLessThanOrEqual(g.secondX(i));
      expect(g.secondX(i) + g.barW).toBeLessThanOrEqual(bandStart + g.band);
    }
  });

  it('never returns NaN before the width is known', () => {
    const g = groupedBars(6, 0, INS);
    expect(Number.isFinite(g.barW)).toBe(true);
    expect(Number.isFinite(g.firstX(3))).toBe(true);
    expect(Number.isFinite(g.secondX(3))).toBe(true);
  });
});

describe('regNiceMax', () => {
  it('fits the tallest bar of every series shown', () => {
    expect(regNiceMax([1, 2], [3, 11])).toBe(15);
  });
  it('is never 0, so an empty chart still has a scale', () => {
    expect(regNiceMax([0, 0, 0])).toBe(5);
  });
});
