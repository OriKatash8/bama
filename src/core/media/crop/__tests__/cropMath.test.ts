import {
  ASPECTS, MIN_CROP, coversWholeImage, fitContain, initialCrop, moveRect, resizeCorner, rotatedSize, toPixelCrop,
} from '../cropMath';

const B = { w: 300, h: 200 };

describe('fitContain', () => {
  it('fits a landscape photo to the width and centres it vertically', () => {
    const f = fitContain({ w: 4000, h: 3000 }, { w: 400, h: 800 });
    expect(f.scale).toBeCloseTo(0.1);
    expect([f.w, f.h]).toEqual([400, 300]);
    expect([f.x, f.y]).toEqual([0, 250]);
  });
  it('fits a portrait photo to the height', () => {
    const f = fitContain({ w: 3000, h: 4000 }, { w: 400, h: 400 });
    expect(f.scale).toBeCloseTo(0.1);
    expect([f.w, f.h]).toEqual([300, 400]);
    expect(f.x).toBe(50);
  });
});

describe('rotatedSize', () => {
  it('swaps on odd quarter turns only', () => {
    expect(rotatedSize({ w: 4, h: 3 }, 0)).toEqual({ w: 4, h: 3 });
    expect(rotatedSize({ w: 4, h: 3 }, 1)).toEqual({ w: 3, h: 4 });
    expect(rotatedSize({ w: 4, h: 3 }, 2)).toEqual({ w: 4, h: 3 });
    expect(rotatedSize({ w: 4, h: 3 }, 3)).toEqual({ w: 3, h: 4 });
  });
});

describe('initialCrop', () => {
  it('is the whole image for Free', () => {
    expect(initialCrop(B, ASPECTS.free)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });
  it('1:1 is the largest centred square', () => {
    expect(initialCrop(B, 1)).toEqual({ x: 50, y: 0, w: 200, h: 200 });
  });
  it('16:9 in a wide image is limited by width', () => {
    const r = initialCrop({ w: 160, h: 200 }, 16 / 9);
    expect(r.w).toBeCloseTo(160);
    expect(r.h).toBeCloseTo(90);
    expect(r.y).toBeCloseTo(55);
  });
  it('4:5 in a landscape image is limited by height', () => {
    const r = initialCrop(B, 4 / 5);
    expect(r.h).toBe(200);
    expect(r.w).toBeCloseTo(160);
  });
});

describe('moveRect', () => {
  const R = { x: 20, y: 20, w: 100, h: 80 };
  it('moves by the drag', () => {
    expect(moveRect(R, 30, 10, B)).toEqual({ ...R, x: 50, y: 30 });
  });
  it('stops at every edge of the image', () => {
    expect(moveRect(R, -999, -999, B)).toEqual({ ...R, x: 0, y: 0 });
    expect(moveRect(R, 999, 999, B)).toEqual({ ...R, x: 200, y: 120 });
  });
});

describe('resizeCorner (free)', () => {
  const R = { x: 50, y: 50, w: 100, h: 100 };
  it('bottom-right grows away from the fixed top-left', () => {
    expect(resizeCorner(R, 'br', 20, 10, B, null)).toEqual({ x: 50, y: 50, w: 120, h: 110 });
  });
  it('top-left keeps the bottom-right corner fixed', () => {
    const r = resizeCorner(R, 'tl', -20, -10, B, null);
    expect(r).toEqual({ x: 30, y: 40, w: 120, h: 110 });
    expect([r.x + r.w, r.y + r.h]).toEqual([150, 150]);
  });
  it('top-right and bottom-left keep their opposite corners', () => {
    const tr = resizeCorner(R, 'tr', 30, -20, B, null);
    expect([tr.x, tr.y + tr.h]).toEqual([50, 150]);
    const bl = resizeCorner(R, 'bl', -30, 20, B, null);
    expect([bl.x + bl.w, bl.y]).toEqual([150, 50]);
  });
  it('cannot leave the image', () => {
    expect(resizeCorner(R, 'br', 999, 999, B, null)).toEqual({ x: 50, y: 50, w: 250, h: 150 });
    expect(resizeCorner(R, 'tl', -999, -999, B, null)).toEqual({ x: 0, y: 0, w: 150, h: 150 });
  });
  it('cannot shrink below the minimum, nor flip over the anchor', () => {
    const r = resizeCorner(R, 'br', -999, -999, B, null);
    expect([r.w, r.h]).toEqual([MIN_CROP, MIN_CROP]);
    expect([r.x, r.y]).toEqual([50, 50]);
  });
});

describe('resizeCorner (locked ratio)', () => {
  const R = { x: 50, y: 50, w: 100, h: 100 };
  it('keeps 1:1 while dragging a corner', () => {
    const r = resizeCorner(R, 'br', 40, 10, B, 1);
    expect(r.w).toBe(r.h);
    expect(r.w).toBe(140);
  });
  it('keeps 16:9 and the anchor', () => {
    const r = resizeCorner({ x: 0, y: 0, w: 160, h: 90 }, 'br', 32, 0, { w: 400, h: 400 }, 16 / 9);
    expect(r.w / r.h).toBeCloseTo(16 / 9);
    expect([r.x, r.y]).toEqual([0, 0]);
    expect(r.w).toBeCloseTo(192);
  });
  it('is limited by the nearer edge and still keeps the ratio', () => {
    const r = resizeCorner(R, 'br', 999, 999, B, 1);
    expect(r.w).toBe(r.h);
    expect(r.x + r.w).toBeLessThanOrEqual(B.w);
    expect(r.y + r.h).toBeLessThanOrEqual(B.h);
    expect(r.w).toBe(150); // 200 - 50 available vertically
  });
  it('top-left with a ratio keeps the bottom-right fixed', () => {
    const r = resizeCorner(R, 'tl', -20, -20, B, 1);
    expect([r.x + r.w, r.y + r.h]).toEqual([150, 150]);
    expect(r.w).toBe(120);
  });
});

describe('toPixelCrop', () => {
  it('divides by the display scale and rounds', () => {
    expect(toPixelCrop({ x: 50, y: 25, w: 100, h: 75 }, 0.1, { w: 4000, h: 3000 })).toEqual({
      originX: 500, originY: 250, width: 1000, height: 750,
    });
  });
  it('never exceeds the image, even with rounding at the far edge', () => {
    const c = toPixelCrop({ x: 299.7, y: 199.9, w: 100.4, h: 100.2 }, 0.1, { w: 3000, h: 2000 });
    expect(c.originX + c.width).toBeLessThanOrEqual(3000);
    expect(c.originY + c.height).toBeLessThanOrEqual(2000);
    expect(c.width).toBeGreaterThanOrEqual(1);
    expect(c.height).toBeGreaterThanOrEqual(1);
  });
  it('a full-size frame is the whole image', () => {
    const f = fitContain({ w: 4032, h: 3024 }, { w: 390, h: 600 });
    const c = toPixelCrop({ x: 0, y: 0, w: f.w, h: f.h }, f.scale, { w: 4032, h: 3024 });
    expect(coversWholeImage(c, { w: 4032, h: 3024 })).toBe(true);
  });
});
