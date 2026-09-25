import { Platform, type ViewStyle } from 'react-native';

/**
 * Tokens for the community-owner dashboard. This screen follows the device
 * colour scheme (the rest of the app is light-only), so both palettes live
 * here and nothing in the dashboard inlines a hex.
 *
 * The blue/red joins-vs-exits pair (series1/series2) is colorblind-validated:
 * don't swap series colours or add a fourth without checking with design.
 */
export type AdminPalette = {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentSoft: string;
  /** Text/icons that sit on a filled accent button. */
  onAccent: string;
  series1: string;
  series2: string;
  series3: string;
  good: string;
  goodBg: string;
  bad: string;
  badBg: string;
  warn: string;
  warnBg: string;
  gridLine: string;
  /** The 1px amber ring on the priority (join-requests) card and the requests tile. */
  priorityRing: string;
  /** Translucent fill behind the sticky header. */
  headerBg: string;
  /** The dark pill toast reads dark in both schemes. */
  toastBg: string;
  toastText: string;
  shadow: string;
};

export const ADMIN_LIGHT: AdminPalette = {
  bg: '#F1F1F4',
  surface: '#FFFFFF',
  surface2: '#F6F6F9',
  surface3: '#ECECF1',
  border: 'rgba(16,16,22,.08)',
  borderStrong: 'rgba(16,16,22,.14)',
  text: '#101014',
  text2: '#5B5B67',
  text3: '#8E8E9A',
  accent: '#2a78d6',
  accentSoft: 'rgba(42,120,214,.10)',
  onAccent: '#FFFFFF',
  series1: '#2a78d6',
  series2: '#e34948',
  series3: '#1baf7a',
  good: '#17875f',
  goodBg: 'rgba(27,175,122,.13)',
  bad: '#c93a39',
  badBg: 'rgba(227,73,72,.12)',
  warn: '#8a6200',
  warnBg: 'rgba(237,161,0,.16)',
  gridLine: 'rgba(16,16,22,.07)',
  priorityRing: 'rgba(237,161,0,.34)',
  headerBg: 'rgba(241,241,244,.82)',
  toastBg: '#101014',
  toastText: '#F4F4F7',
  shadow: '#101016',
};

export const ADMIN_DARK: AdminPalette = {
  bg: '#0D0D10',
  surface: '#16161A',
  surface2: '#1D1D22',
  surface3: '#26262D',
  border: 'rgba(255,255,255,.09)',
  borderStrong: 'rgba(255,255,255,.16)',
  text: '#F4F4F7',
  text2: '#A2A2AE',
  text3: '#71717E',
  accent: '#3987e5',
  accentSoft: 'rgba(57,135,229,.16)',
  onAccent: '#FFFFFF',
  series1: '#3987e5',
  series2: '#e66767',
  series3: '#199e70',
  good: '#43c495',
  goodBg: 'rgba(27,175,122,.13)',
  bad: '#f08080',
  badBg: 'rgba(227,73,72,.12)',
  warn: '#e0b45c',
  warnBg: 'rgba(237,161,0,.16)',
  gridLine: 'rgba(255,255,255,.08)',
  priorityRing: 'rgba(237,161,0,.34)',
  headerBg: 'rgba(13,13,16,.82)',
  toastBg: '#26262D',
  toastText: '#F4F4F7',
  shadow: '#000000',
};

export const RADIUS = { card: 20, pill: 999, bar: 4 } as const;

export const SPACE = {
  cardGap: 14,
  cardPad: 17,
  rowPadV: 11,
  rowPadH: 18,
  gutter: 16,
} as const;

/** Heebo type scale. Weights map onto AppText's `weight` prop. */
export const TYPE = {
  screenTitle: { fontSize: 30, letterSpacing: -0.75 },
  cardTitle: { fontSize: 15.5 },
  statValue: { fontSize: 34, letterSpacing: -1.2 },
  statLabel: { fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  rowName: { fontSize: 13.5 },
  rowMeta: { fontSize: 12 },
  chip: { fontSize: 11.5 },
  button: { fontSize: 12.5 },
  axis: { fontSize: 10.5 },
} as const;

/** Every number that sits in a column. */
export const TABULAR = { fontVariant: ['tabular-nums' as const] };

/** Two columns of join requests from this width up. */
export const TWO_COL_MIN_WIDTH = 900;

export function cardShadow(p: AdminPalette): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      boxShadow: '0 1px 2px rgba(16,16,22,.05), 0 8px 24px -12px rgba(16,16,22,.16)',
    } as ViewStyle;
  }
  return Platform.OS === 'android'
    ? { elevation: 2 }
    : { shadowColor: p.shadow, shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } };
}

/** Card shadow plus the 1px inset amber ring that marks the priority card. */
export function priorityShadow(p: AdminPalette): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      boxShadow: `inset 0 0 0 1px ${p.priorityRing}, 0 1px 2px rgba(16,16,22,.05), 0 8px 24px -12px rgba(16,16,22,.16)`,
    } as ViewStyle;
  }
  // Native has no inset shadow; a 1px border draws the same ring.
  return { ...cardShadow(p), borderWidth: 1, borderColor: p.priorityRing };
}

/** Motion timings from the spec. */
export const MOTION = {
  countUp: 900,
  lineDraw: 1100,
  barGrow: 780,
  barStagger: 55,
  activityFill: 1000,
  rowLeave: 320,
  livePulse: 2400,
  confirmWindow: 4000,
} as const;

/** cubic-bezier(.22,.8,.2,1) */
export const EASE_OUT: [number, number, number, number] = [0.22, 0.8, 0.2, 1];
