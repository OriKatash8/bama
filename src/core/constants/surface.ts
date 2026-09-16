/**
 * Surface, radius and spacing tokens for the warm-paper direction.
 *
 * WHY THIS IS A MODULE CONSTANT AND NOT PART OF `useTheme()`
 * The colour tokens live in `src/core/hooks/useTheme.tsx` behind a hook, and
 * screens apply them inline in JSX. That works for colour and cannot work here:
 * a screen's `createStyles()` is a plain function called from `useMemo` that
 * returns a `StyleSheet.create`, so it cannot call a hook. It is the same reason
 * font families are already threaded into `createStyles` as arguments rather
 * than read from `useAppFont` inside it. Radius and spacing belong in the
 * stylesheet, so they have to be importable without React.
 * `constants/mediaViewer.ts` is the existing precedent for a palette file of
 * this shape.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * The brand colours. `#004aad` and `#cb6ce6` stay in `useTheme` as
 * `colors.primary` and `colors.accent`; restating them here would give the app
 * two sources of truth for the one thing that must never drift.
 */

/**
 * Three tiers, one value each, chosen to collapse the ten distinct radii this
 * screen used to carry. `sm` is small controls, `md` is cards and fields, `lg`
 * is the outer canvas.
 *
 * Circles are not a tier: `s3Avatar` stays at half its own width, because that
 * is a shape, not a corner.
 */
export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
} as const;

/**
 * Sized to what this screen actually uses — twenty hardcoded values across about
 * sixty occurrences, most of them already 4, 8 or 16. Nothing larger is included
 * because nothing on this screen needs it; `scrollContent.paddingBottom` (56, to
 * clear the floating tab bar) stays a literal, since it is a measurement of
 * another component rather than a rhythm value.
 *
 * Grouping rule: more space between groups than within them. In practice that
 * means `lg`/`xl` between sections and `xs`/`sm` inside a control.
 */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Separation comes from the luminance gap between `canvas` and `raised`, not
 * from borders. A card on the canvas needs no hairline; a border belongs only
 * where two same-coloured surfaces touch.
 *
 * `pending` is the unfilled progress bar. It is here rather than in the theme
 * because it is paper, not brand — the filled bar stays `colors.primary`.
 */
export const SURFACE = {
  canvas: '#F7F5F1',
  raised: '#FFFDFA',
  pending: '#E5E0D6',
} as const;

/**
 * Warm greys, not neutral ones: pure `#000`/`#888` read cold against `canvas`.
 * `hint` is for placeholders and the optional/help microcopy — it is
 * deliberately light, and must never carry information that is not repeated
 * somewhere with more contrast.
 */
export const TEXT = {
  primary: '#1C1B19',
  secondary: '#8A857C',
  hint: '#B5AFA4',
} as const;
