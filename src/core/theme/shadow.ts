import { Platform, type ViewStyle } from 'react-native';

/**
 * One description of a drop shadow, rendered natively on every platform.
 *
 * WHY: the styles were written for iOS, where `shadowOpacity` / `shadowRadius` /
 * `shadowOffset` give a faint, soft shadow (opacity 0.05–0.09 on most cards).
 * Android ignores all three: `elevation` draws a Material shadow around the
 * view's bounds, far heavier and sharper than the values asked for — a hard line
 * under every tab page's white sheet, a visible box around list cards. So:
 *
 *  - iOS and web get EXACTLY the shadow* props they always had (only the keys
 *    that were given, so nothing silently becomes a default).
 *  - Android gets `boxShadow` (React Native new architecture, Android 9+), which
 *    honours offset, blur and colour+opacity, so the shadow looks like iOS's.
 *
 * ANDROID MAPPING, calibrated on the emulator against the tab-page sheets (the
 * hard line above the tab bar is gone), the category card list (no box) and the
 * dialog / mode-switcher cards (soft, diffuse):
 *   blurRadius = shadowRadius × 2     iOS shadowRadius is roughly half a CSS blur
 *                                     (WebKit and Figma both convert that way)
 *   alpha      = shadowOpacity × 1    iOS opacity carries over unchanged
 * No iOS render was available to compare against, so these are the physical
 * conversion confirmed to look right and not heavy on Android, not a pixel match.
 *
 * `elevation`, when given, is kept on Android with a transparent shadow colour:
 * it still decides which sibling paints on top (a popup over a list), but draws
 * nothing itself. The boxShadow is the only visible shadow.
 */
export type ShadowSpec = {
  color?: string;
  opacity?: number;
  radius?: number;
  offsetX?: number;
  offsetY?: number;
  /** The view's original `elevation`: kept on Android for paint order only. */
  elevation?: number;
  /**
   * 'none': draw no boxShadow on Android and leave `elevation` exactly as it was.
   * For views that never showed a shadow on Android (no own background, so the
   * elevation drew nothing) and should keep not showing one.
   */
  android?: 'shadow' | 'none';
};

/** CSS blur per unit of iOS shadowRadius (see the mapping note above). */
export const ANDROID_BLUR_PER_RADIUS = 2;
/** Multiplier on iOS shadowOpacity (see the mapping note above). */
export const ANDROID_OPACITY_GAIN = 1;

const NAMED: Record<string, [number, number, number]> = { black: [0, 0, 0], white: [255, 255, 255] };

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() and black/white into [r, g, b, a]. */
export function parseColor(input: string): [number, number, number, number] | null {
  const c = input.trim().toLowerCase();
  if (c in NAMED) return [...NAMED[c], 1];
  if (c === 'transparent') return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{3,8})$/.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (h.length === 6) h += 'ff';
    if (h.length !== 8) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(parseInt(h.slice(6, 8), 16) / 255) as [number, number, number, number];
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(c);
  if (rgb) {
    const p = rgb[1].split(',').map((x) => parseFloat(x));
    if (p.length >= 3 && p.every((n) => Number.isFinite(n))) return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}

function rgba(color: string | undefined, opacity: number): string {
  const parsed = parseColor(color ?? '#000000') ?? [0, 0, 0, 1];
  const a = Math.min(1, Math.max(0, parsed[3] * opacity));
  return `rgba(${parsed[0]}, ${parsed[1]}, ${parsed[2]}, ${Number(a.toFixed(4))})`;
}

export function shadow(spec: ShadowSpec): ViewStyle {
  if (Platform.OS !== 'android') {
    // iOS and web: the original props, and only the ones that were given.
    const out: ViewStyle = {};
    if (spec.color !== undefined) out.shadowColor = spec.color;
    if (spec.offsetX !== undefined || spec.offsetY !== undefined) {
      out.shadowOffset = { width: spec.offsetX ?? 0, height: spec.offsetY ?? 0 };
    }
    if (spec.opacity !== undefined) out.shadowOpacity = spec.opacity;
    if (spec.radius !== undefined) out.shadowRadius = spec.radius;
    return out;
  }

  const opacity = (spec.opacity ?? 0) * ANDROID_OPACITY_GAIN;
  if (spec.android === 'none') return spec.elevation !== undefined ? { elevation: spec.elevation } : {};

  const out: ViewStyle = {};
  if (spec.elevation !== undefined) {
    // Paint order only: a transparent shadow colour makes the Material shadow invisible.
    out.elevation = spec.elevation;
    out.shadowColor = 'transparent';
  }
  if (opacity > 0) {
    out.boxShadow = [{
      offsetX: spec.offsetX ?? 0,
      offsetY: spec.offsetY ?? 0,
      blurRadius: (spec.radius ?? 0) * ANDROID_BLUR_PER_RADIUS,
      color: rgba(spec.color, opacity),
    }];
  }
  return out;
}
