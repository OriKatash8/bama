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

// Per URL, for the life of the app: a bubble scrolled away and back (or
// re-rendered by a new message) starts at its real shape, not the placeholder.
const ratioCache = new Map<string, number>();

/**
 * A chat photo's or video's own shape. Messages carry no size, so the bubble
 * starts at `initial` and takes the real (capped) ratio once the media reports
 * it — which also fixes media sent before this existed.
 */
export function useMediaRatio(uri: string, initial: number): [number, (width: number, height: number) => void] {
  const [ratio, setRatio] = useState(() => ratioCache.get(uri) ?? initial);
  function setSize(width: number, height: number) {
    const next = clampRatio(width / height);
    ratioCache.set(uri, next);
    setRatio(next);
  }
  return [ratio, setSize];
}
