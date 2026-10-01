import { axisLabels, axisLabelsFit } from '../axisLabels';

const L = (n: number) => Array.from({ length: n }, (_, i) => `L${i}`);

it('prints every label when they fit', () => {
  expect(axisLabels(L(7))).toEqual(L(7));
  expect(axisLabels(L(12), 12)).toEqual(L(12));
});

it('thins a crowded axis to at most max labels, always keeping the newest', () => {
  for (const n of [12, 24, 30]) {
    const out = axisLabels(L(n));
    expect(out).toHaveLength(n);
    expect(out[n - 1]).toBe(`L${n - 1}`);
    expect(out.filter(Boolean).length).toBeLessThanOrEqual(8);
    expect(out.filter(Boolean).length).toBeGreaterThan(1);
  }
});

it('fits labels to the width: few on a phone, many on web, never fewer than two', () => {
  expect(axisLabelsFit(320)).toBe(7);
  expect(axisLabelsFit(1100)).toBeGreaterThanOrEqual(24);
  expect(axisLabelsFit(0)).toBe(2);
});
