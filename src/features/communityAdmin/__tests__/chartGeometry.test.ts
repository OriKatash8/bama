import {
  FLOW_H,
  FLOW_INSETS as I,
  MARKET_INSETS,
  areaPath,
  barLayout,
  flowNiceMax,
  gridValues,
  linePath,
  marketNiceMax,
  marketWeeks,
  nearestIndex,
  pathLength,
  showsValueLabel,
  sparkPoints,
  tickLabel,
  xAt,
  xLabelIndices,
  yAt,
} from '../chartGeometry';

const noNaN = (s: string) => expect(s).not.toMatch(/NaN|Infinity/);

describe('y scales', () => {
  it('flow max is at least 6 and even', () => {
    expect(flowNiceMax([])).toBe(6);
    expect(flowNiceMax([0, 0])).toBe(6);
    expect(flowNiceMax([7])).toBe(8);
    expect(flowNiceMax([10])).toBe(10);
  });
  it('market max rounds up to 5s and is never 0', () => {
    expect(marketNiceMax([])).toBe(5);
    expect(marketNiceMax([0])).toBe(5);
    expect(marketNiceMax([11])).toBe(15);
  });
  it('gives 5 grid values and prints halves with one decimal', () => {
    expect(gridValues(6)).toEqual([0, 1.5, 3, 4.5, 6]);
    expect(gridValues(6).map(tickLabel)).toEqual(['0', '1.5', '3', '4.5', '6']);
  });
  it('maps 0 to the baseline and max to the top inset', () => {
    expect(yAt(0, 6, FLOW_H, I)).toBe(FLOW_H - I.bottom);
    expect(yAt(6, 6, FLOW_H, I)).toBe(I.top);
  });
});

describe('x spacing', () => {
  it('spreads n points across the plot, first on the left inset, last on the right', () => {
    expect(xAt(0, 5, 342, I)).toBe(I.left);
    expect(xAt(4, 5, 342, I)).toBe(342 - I.right);
  });
  it('puts a single point in the middle instead of dividing by zero', () => {
    const x = xAt(0, 1, 342, I);
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBe(I.left + (342 - I.left - I.right) / 2);
    expect(nearestIndex(200, 1, 342, I)).toBe(0);
  });
  it('never returns NaN at width 0', () => {
    expect(Number.isFinite(xAt(3, 7, 0, I))).toBe(true);
    noNaN(linePath([[xAt(0, 2, 0, I), yAt(1, 6, FLOW_H, I)], [xAt(1, 2, 0, I), 0]]));
  });
  it('labels about five points and always the last', () => {
    expect(xLabelIndices(30)).toEqual([0, 6, 12, 18, 24, 29]);
    expect(xLabelIndices(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(xLabelIndices(1)).toEqual([0]);
    expect(xLabelIndices(0)).toEqual([]);
  });
  it('snaps the crosshair to the nearest point, clamped to the ends', () => {
    expect(nearestIndex(I.left, 5, 342, I)).toBe(0);
    expect(nearestIndex(-50, 5, 342, I)).toBe(0);
    expect(nearestIndex(9999, 5, 342, I)).toBe(4);
    expect(nearestIndex(xAt(2, 5, 342, I) + 10, 5, 342, I)).toBe(2);
  });
});

describe('paths', () => {
  it('closes the area down to the baseline', () => {
    expect(areaPath([[0, 10], [10, 20]], 50)).toBe('M0.0 10.0 L10.0 20.0 L10.0 50.0 L0.0 50.0 Z');
    expect(areaPath([], 50)).toBe('');
  });
  it('measures a polyline', () => {
    expect(pathLength([[0, 0], [3, 4], [3, 10]])).toBe(11);
    expect(pathLength([[5, 5]])).toBe(0);
  });
});

describe('sparkPoints', () => {
  it('fits min→max into the 34px height', () => {
    const pts = sparkPoints([0, 10], 100);
    expect(pts[0]).toEqual([2, 32]);
    expect(pts[1]).toEqual([98, 2]);
  });
  it('draws a flat series at mid-height, and a single value in the middle', () => {
    expect(sparkPoints([4, 4, 4], 100).map((p) => p[1])).toEqual([17, 17, 17]);
    expect(sparkPoints([4], 100)).toEqual([[50, 17]]);
  });
  it('returns nothing until it has a width', () => {
    expect(sparkPoints([1, 2], 0)).toEqual([]);
  });
});

describe('bars', () => {
  it('caps the bar at 30 and keeps an 8px gap in narrow bands', () => {
    expect(barLayout(4, 1000, MARKET_INSETS).barW).toBe(30);
    const narrow = barLayout(13, 200, MARKET_INSETS);
    expect(narrow.barW).toBeCloseTo(narrow.band - 8);
  });
  it('never has a zero or negative bar width', () => {
    expect(barLayout(13, 40, MARKET_INSETS).barW).toBeGreaterThan(0);
    expect(barLayout(0, 300, MARKET_INSETS).band).toBe(0);
  });
  it('labels every other bar and always the last', () => {
    expect([0, 1, 2, 3].map((i) => showsValueLabel(i, 4))).toEqual([true, false, true, true]);
  });
  it('shows at least four weeks', () => {
    expect([7, 30, 90].map(marketWeeks)).toEqual([4, 4, 13]);
  });
});
