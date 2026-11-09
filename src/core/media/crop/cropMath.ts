/**
 * Geometry for the crop editor. Pure functions, no React, so the parts that are easy to get
 * wrong (display coords vs. image pixels, aspect locking, rotation) are unit-tested.
 *
 * Two coordinate spaces:
 *  - display: points on screen, origin at the top-left of the image as shown (contain-fit);
 *  - pixels: the real image, which is what expo-image-manipulator crops.
 */

export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type AspectKey = 'free' | '1:1' | '4:5' | '16:9';

/** width / height for each preset; null = free. */
export const ASPECTS: Record<AspectKey, number | null> = {
  free: null,
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
};

/** Smallest crop edge, in display points. */
export const MIN_CROP = 56;

/** Quarter turns clockwise, 0-3. */
export function rotatedSize(size: Size, quarterTurns: number): Size {
  return quarterTurns % 2 === 0 ? size : { w: size.h, h: size.w };
}

/** `contain`: the image scaled to fit the box, centred. `scale` = display points per pixel. */
export function fitContain(image: Size, box: Size): { scale: number; x: number; y: number; w: number; h: number } {
  const scale = Math.min(box.w / image.w, box.h / image.h);
  const w = image.w * scale;
  const h = image.h * scale;
  return { scale, w, h, x: (box.w - w) / 2, y: (box.h - h) / 2 };
}

/** The starting frame: the whole image for Free, else the largest centred rect of that ratio. */
export function initialCrop(bounds: Size, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: bounds.w, h: bounds.h };
  let w = bounds.w;
  let h = w / ratio;
  if (h > bounds.h) {
    h = bounds.h;
    w = h * ratio;
  }
  return { x: (bounds.w - w) / 2, y: (bounds.h - h) / 2, w, h };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Drag the whole frame, keeping it inside the image. */
export function moveRect(start: Rect, dx: number, dy: number, bounds: Size): Rect {
  return {
    ...start,
    x: clamp(start.x + dx, 0, bounds.w - start.w),
    y: clamp(start.y + dy, 0, bounds.h - start.h),
  };
}

/**
 * Drag one corner; the opposite corner stays put. With a ratio the frame keeps it (the corner
 * follows the larger of the two drags); the frame never leaves the image or shrinks below `min`.
 */
export function resizeCorner(
  start: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  bounds: Size,
  ratio: number | null,
  min: number = MIN_CROP,
): Rect {
  const right = corner === 'tr' || corner === 'br';
  const bottom = corner === 'bl' || corner === 'br';
  const ax = right ? start.x : start.x + start.w; // fixed (anchor) corner
  const ay = bottom ? start.y : start.y + start.h;
  const sx = right ? 1 : -1; // direction from the anchor to the dragged corner
  const sy = bottom ? 1 : -1;
  const px = clamp((right ? start.x + start.w : start.x) + dx, 0, bounds.w);
  const py = clamp((bottom ? start.y + start.h : start.y) + dy, 0, bounds.h);
  const availW = sx > 0 ? bounds.w - ax : ax;
  const availH = sy > 0 ? bounds.h - ay : ay;

  let w = Math.max(sx * (px - ax), min);
  let h = Math.max(sy * (py - ay), min);
  if (ratio) {
    w = Math.max(w, h * ratio, min, min * ratio);
    w = Math.min(w, availW, availH * ratio);
    h = w / ratio;
  } else {
    w = Math.min(w, availW);
    h = Math.min(h, availH);
  }
  return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h };
}

/** A display-space frame as an integer pixel rect inside the image, as manipulator.crop wants it. */
export function toPixelCrop(
  rect: Rect,
  scale: number,
  image: Size,
): { originX: number; originY: number; width: number; height: number } {
  const originX = clamp(Math.round(rect.x / scale), 0, image.w - 1);
  const originY = clamp(Math.round(rect.y / scale), 0, image.h - 1);
  const width = clamp(Math.round(rect.w / scale), 1, image.w - originX);
  const height = clamp(Math.round(rect.h / scale), 1, image.h - originY);
  return { originX, originY, width, height };
}

/** True when the pixel rect is the whole image (nothing to crop). */
export function coversWholeImage(
  c: { originX: number; originY: number; width: number; height: number },
  image: Size,
): boolean {
  return c.originX === 0 && c.originY === 0 && c.width === image.w && c.height === image.h;
}
