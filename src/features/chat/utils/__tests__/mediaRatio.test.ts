import { clampRatio, ratioFromSize } from '../mediaRatio';

describe('ratioFromSize: the shape a message carries, so its bubble never changes height on load', () => {
  it('is width / height, within the same caps as a loaded image', () => {
    expect(ratioFromSize(1000, 1000)).toBe(1);
    expect(ratioFromSize(1600, 900)).toBeCloseTo(16 / 9);
    expect(ratioFromSize(4000, 1000)).toBe(16 / 9); // wider than 16:9 is capped
    expect(ratioFromSize(1000, 4000)).toBe(3 / 4); // taller than 3:4 is capped
  });
  it('agrees with what onLoad would later compute, so the bubble does not move when the file arrives', () => {
    for (const [w, h] of [[3024, 4032], [1080, 1920], [800, 600]]) expect(ratioFromSize(w, h)).toBe(clampRatio(w / h));
  });
  it('is undefined when the message carries no usable size (older media): the bubble then sizes on load', () => {
    for (const [w, h] of [[undefined, undefined], [0, 10], [10, 0], [NaN, 10], [-1, 5], [10, undefined]]) {
      expect(ratioFromSize(w as number | undefined, h as number | undefined)).toBeUndefined();
    }
  });
});
