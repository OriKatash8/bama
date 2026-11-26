import { useState } from 'react';
import { Dimensions } from 'react-native';

// Sized like WhatsApp: every photo/video bubble is the same width, and its
// height follows the media's shape within these caps (cover crops the rest).
/** Photo and video bubble width: 65% of the screen, at most 300. */
export const MEDIA_BUBBLE_WIDTH = Math.min(Math.round(Dimensions.get('window').width * 0.65), 300);
const MIN_RATIO = 3 / 4;  // taller (a screenshot, a 9:16 video) is cropped to 3:4
const MAX_RATIO = 16 / 9; // wider is cropped to 16:9

/** width / height, kept within [3:4, 16:9]; 1 when the size is unknown. */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/**
 * The ratio for a size the message itself carries (mediaWidth/mediaHeight, written when it was
 * sent), or undefined when it carries none. This is what stops the list jumping: a bubble that
 * starts at its final height never changes height when the file loads.
 */
export function ratioFromSize(width?: number, height?: number): number | undefined {
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return clampRatio(width / height);
}

/** A usable pixel size: two positive finite numbers, rounded. Anything else is dropped, never written. */
export function validMediaSize(width?: number, height?: number): { width: number; height: number } | null {
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (width > 20000 || height > 20000) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

// Per URL, for the life of the app: a bubble scrolled away and back (or
// re-rendered by a new message) starts at its real shape, not the placeholder.
const ratioCache = new Map<string, number>();

/**
 * A chat photo's or video's own shape. New messages carry their size (`known`) and start at their
 * final shape. Older ones start at `initial` and take the real (capped) ratio once the media
 * reports it.
 */
export function useMediaRatio(
  uri: string,
  initial: number,
  known?: { width?: number; height?: number },
): [number, (width: number, height: number) => void] {
  const [ratio, setRatio] = useState(() => ratioCache.get(uri) ?? ratioFromSize(known?.width, known?.height) ?? initial);
  function setSize(width: number, height: number) {
    const next = clampRatio(width / height);
    ratioCache.set(uri, next);
    setRatio(next);
  }
  return [ratio, setSize];
}
