# Warm-paper restyle — Phase 1 investigation, client home screen

Target: `src/app/(client)/(tabs)/home/index.tsx`. No edits made.

## 0. Two premises in the brief that are wrong — read first

**(a) The 3-bar progress indicator already exists.** It is not something to add.
`progressRow` + three `progressBar` views render at lines 354-356 (step 1),
549-551 (step 2) and 660-662 (step 3), directly beneath the "Step 1 of 3" text:

    progressRow: { gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 2 }
    progressBar: { flex: 1, height: 4, borderRadius: 2 }

Done bars are `#004aad`; pending bars are `colors.border` (= `#004aad20`).
So STEP 2's real work is three small edits, not a new component: delete the now
redundant `stepLabel` text, change `height: 4` to `3`, and swap the pending fill
from `#004aad20` to `#E5E0D6`. The radius is already 2.

**(b) The step-2 tiles are not photographic, and not outline icons.** My earlier
report called them "photographic" — that was wrong, and the brief's "the outline
icons stay exactly as they are" inherits the error from a different direction.

They are **flat raster icon plates**: a white glyph knocked out of a solid
`#004aad`→`#cb6ce6` gradient rounded rectangle, on a transparent 1024x1024
canvas, 80-228 KB each (`assets/images/categories/*-wide.png`, eight of them via
`ROLE_IMAGES`). Rendered through `expo-image` at `width: '100%', height: 80`
with `contentFit="cover"`, so the square source is cropped to its middle band.

This matters for a warm-paper direction: each tile already carries a saturated
blue-to-purple gradient block. On `#FFFDFA` they will dominate the page far more
than they do on today's lavender ground. Leaving them untouched is a legitimate
choice, but it is a choice — the restyle cannot make this screen read as warm
paper while eight gradient plates sit in the middle of it.

Step 3 uses a different set: `CATEGORY_ICON`, round 400x400 blue icons at 56pt
in `s3Avatar`.

## 1. Every hardcoded value on this screen

Confirmed still true: **15 colour tokens, zero spacing/radius/type tokens.**
**72 of 134 style keys are dead** (62 live).

### Radius — 10 distinct values across 15 live styles

| Value | Used by |
| --- | --- |
| 2 | `progressBar` |
| 8 | `input`, `locationSearchInput` |
| 10 | `submitBtn`, `dateSquareClear` |
| 11 | `s3Num` |
| 12 | `tile`, `tileControlBtnRemove`, `tileControlBtnAdd` |
| 13 | `s3Slot` |
| 14 | `s3Footer` |
| 16 | `dateSquare`, `locationBox`, `s3Pill` |
| 18 | `s3Card` |
| 28 | `s3Avatar` — a circle (half of 56), a shape not a tier |

### Spacing — 20 distinct values, ~60 occurrences

`0, 1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 20, 32, 36, 56`

16 is the de-facto page gutter (7 uses: `card.margin`, `rolesCard`/`s3Card`
`marginHorizontal`, `progressRow.marginHorizontal`, `stepLabel.paddingHorizontal`,
`backArrow.paddingHorizontal`, `label.marginTop`). 4 and 8 are the common small
gaps. The oddities are `s3Slot.padding: 11`, `s3Card.padding: 13`,
`s3Pill.paddingHorizontal: 13`, `s3Footer.paddingVertical: 15`,
`submitWrap.paddingHorizontal: 36`, `scrollContent.paddingBottom: 56`.

### Backgrounds — the important finding

**`card` and `rolesCard` have no `backgroundColor` at all.** They are invisible
layout containers. Today's "cards" are the gradient showing through, with only
the inner controls painted:

| Surface | Current value |
| --- | --- |
| Page canvas | `colors.bgGradient` = `['#E6E0F4', '#D0DFF7']`, painted by shared `Screen` |
| `card`, `rolesCard` | none — transparent |
| Both `TextInput`s | `#ffffff`, set inline in JSX (lines 362, 378) |
| `dateSquare`, `locationBox`, `s3Card` | `#ffffff` |
| `s3Slot` | `#faf9fe` |
| `s3Pill` | `#004aad` selected / `#f0f0f7` unselected |
| `tileControls` | `rgba(255,255,255,0.92)` |
| `locationOverlay` | `rgba(0,0,0,0.55)` |

So "cards at `#FFFDFA` on a `#F7F5F1` canvas" is **adding a surface that does not
exist**, not recolouring one. That is the single biggest visual change in the
brief.

### Borders — there are no card hairlines to remove

Live borders are only: `locationBox` (2pt `#004aad`), `locationSearchInput`
(1pt `#004aad`), the error state (`1.5pt #fc8181`, applied inline), and the tile
selection ring (`borderWidth: 2, borderColor: colors.accent`). The inner cards
carry none, so "remove the hairlines on inner cards" is already satisfied.

## 2. What a minimal token file should contain, and where

**Where: `src/core/constants/surface.ts`**, not `useTheme.tsx`.

The reason is mechanical, not stylistic. `createStyles()` is a plain function
called from `useMemo` that returns a `StyleSheet.create` — it cannot call
`useTheme()`. That is exactly why font families are already threaded in as
arguments and why every colour token on this screen is applied inline in JSX.
Tokens must be importable module constants. `src/core/constants/mediaViewer.ts`
is the existing precedent for precisely this.

Proposed contents, sized to what this screen actually uses:

    RADIUS = { sm: 10, md: 14, lg: 20 }        // controls / cards+fields / canvas
    SPACE  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
    SURFACE = { canvas: '#F7F5F1', raised: '#FFFDFA', pending: '#E5E0D6' }
    TEXT    = { primary: '#1C1B19', secondary: '#8A857C', hint: '#B5AFA4' }

Brand stays in `useTheme` — `colors.primary` `#004aad`, `colors.accent`
`#cb6ce6`. The token file must not restate them.

**The tension you need to rule on.** The brief says "the layout does not change"
and also "spacing via tokens" and "more whitespace between groups than within
them". Those cannot all hold: collapsing 20 spacing values onto a 6-step scale
moves `11→12`, `13→12`, `15→16`, `36→32`, `5→4`, `7→8`. Nothing reflows or
reorders, but gaps shift by 1-4pt in roughly a dozen places. I read "layout does
not change" as structure — same elements, same order, same flow — and the
spacing brief as licence to move the gaps. Confirm, or I will pin the odd values
as-is and only tokenise the ones that already match.

## 3. The 72 dead style keys

**None of them are deleted as a side effect of the restyle.** Dead styles need
no token migration precisely because nothing references them, so the restyle
never touches them. Deleting them is an independent cleanup, and the brief says
no refactor beyond what the restyle needs — so my recommendation is to leave all
72 and track it separately.

If you do want them gone, they fall into clean clusters that are safe because the
features they belonged to are gone: `subcat*` (16 keys), `summary*` (16),
`vibe*` (10), `panel*`/`subcatPanel` (8), `chip*` (6), `qty*` (6), `sub*` (4).
That is 66 of the 72.

I would leave the remaining six regardless — `sectionTitle`, `grid`, `disabled`,
`dateRow`, `dateCol`, `backdrop`/`modalBackdrop` — because they are generic
names a future edit may reach for, and they cost nothing.

Worth knowing: three of the dead keys (`subcatHint`, `subHint`,
`summaryFieldLabel`) are the only `letterSpacing` values on this screen. They are
why the typography audit reported tracking "present but dead".

## 4. Collisions with the committed motion work (2faf44c)

**(a) The tile selection ring — a real collision.** You asked for an outline with
negative offset instead of `borderWidth: 2`. Two problems:

1. React Native has no `outline` property on native; it is web-only. A ring has
   to be a positioned `View` with a border.
2. `tile` sets `overflow: 'hidden'` (it clips the image to the corner radius). A
   ring at negative offset would be **clipped away entirely**.

So this needs the clipping container and the ring to become different views —
a small structural change inside the tile. It does not touch `PressableScale`,
but it is more than a style swap, and your "layout does not change" line deserves
to know about it. The upside is real: it removes the 2pt layout shift on select.

**(b) `stepWrap: { flexGrow: 1 }`** is the transition wrapper. Any change to
`scrollContent` or the step containers must preserve it, or `styles.grow` stops
pushing the Next button to the bottom of a tall screen.

**(c) Deleting the "Step 1 of 3" text removes a `lineHeight: 18`** set by the
typography pass on `stepLabel`. You said not to touch existing lineHeight. I read
deleting the element as removal rather than alteration, but flagging it since it
is your rule.

**(d) The canvas needs no edit to `Screen`.** `Screen` already accepts
`backgroundColor` and `gradient` props, so home can pass `#F7F5F1` without
touching the shared component or the theme.

**(e) No collision** with `PressableScale`, `haptics.ts`, `goToStep`, the scroll
one-shot, or `scrollToFirstError`. The restyle is style values plus the tile ring
structure.

## 5. Step 4 preview — the typing placeholder

Short answer ahead of time: **absolutely-positioned `Animated.Text` behind an
empty input**, not `setState` per character. Per-character `setState` on the
`placeholder` prop re-renders the `TextInput` ~30 times per example on a screen
that also holds the tile `FlatList`, and RN cannot animate a string prop. Detail
at STEP 4.
