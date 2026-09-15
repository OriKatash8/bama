/**
 * Chrome palette for the full-screen portfolio viewer.
 *
 * The backdrop itself is NOT here: the viewer paints `colors.bgGradient` from
 * `useTheme()`, the same token `Screen` gives every page, so the lightbox sits on
 * the profile page's own background instead of a black void.
 *
 * That makes the chrome's contrast its own problem. It floats over two very
 * different grounds — the pale page gradient in the letterbox bars, and whatever
 * photo is underneath — so the pills carry a dark ground of their own rather than
 * tinting whatever is behind them. Translucent *white* would disappear against
 * the light backdrop.
 */
export const MEDIA_VIEWER_CHROME_BG = 'rgba(0,0,0,0.45)';

/** Caption body and chrome icons. */
export const MEDIA_VIEWER_CHROME_FG = '#ffffff';

/** The "photo" / "video" label above the caption. */
export const MEDIA_VIEWER_LABEL_FG = 'rgba(255,255,255,0.5)';

/**
 * Caption scrim. White text over arbitrary photography needs a gradient behind it,
 * not a flat panel: a flat wash disappears on a dark image and fails to carry the
 * text on a bright one.
 *
 * There is no matching top scrim. One existed while the backdrop was near-black;
 * against the pale page gradient it read as a smudge, and the self-contained dark
 * pills no longer need it.
 */
export const MEDIA_VIEWER_BOTTOM_SCRIM = ['transparent', 'rgba(0,0,0,0.8)'] as const;
