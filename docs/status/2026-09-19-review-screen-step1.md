# Request-review screen (סקירת הבקשה): Step 1 findings

## 1. Files and what else uses them
- **The whole screen is one file:** `src/app/(client)/(tabs)/home/summary.tsx`.
  - The cards, section headers, field rows, crew rows and publish bar are all inline render helpers: `renderCardHeader`, `renderValue`, `renderMetaRow`, plus the crew `map`.
  - There are no separate card or row components.
- **Pro side:** nothing is shared with the pro side. No `(professional)` route renders it.
- **Tab bar:** `src/app/(client)/(tabs)/_layout.tsx:58` hides the tab bar on this route (`inProjectReview`). No change needed there.
- **Test:** `src/app/(client)/(tabs)/home/__tests__/summaryBack.test.tsx` (3 tests). They find elements by text ("Back", "Edit"), not by colour or style.

## 2. Where the colours come from
- **Mostly hardcoded:**
  - `BLUE = '#004aad'`, `BLUE_MUTED`, `BLUE_FAINT`, declared inside the component
  - `#004aad` again in the StyleSheet (edit buttons, publish button, crew icon tile, back text and title)
  - `#9aa0b8` for the ✕ and the "flexible" chip
- **From `useTheme`, only two places:**
  - `colors.border`, for the hairline between crew rows
  - the `Screen` component's default page gradient (`colors.bgGradient`)
- **Nothing** comes from `surface.ts`.
- **Can we do this without touching `useTheme`?** Yes. Both theme uses get replaced by local colours (the `#F2F0F7` divider, and `backgroundColor '#FAFAFC'` on `Screen`). No reason to stop.

## 3. The role icons
- **What step 2 draws today:** `cat.image`, which is `ROLE_IMAGES` in `src/features/crew/data/roleTiles.ts`, the full `*-wide.png` gradient tiles.
- **A flat version exists:** the same file already exports **`ROLE_GLYPHS`**, the same eight marks with the gradient plate removed (`*-glyph.png`). It's exposed as `cat.glyph` on `CATEGORIES`.
- **The glyph files** (`assets/images/categories/*-glyph.png`):
  - 256×256
  - pure black (every opaque pixel is `#000`) on a transparent background
  - so expo-image `tintColor` tints them cleanly to `#6D28D9`
  - nothing renders them today; they were added earlier alongside the tiles
- **Reaching them:** `summary.tsx` already imports from `@features/crew/data/categories` and `@features/crew/hooks`. Importing `CATEGORIES` / `ROLE_GLYPHS` from `@features/crew/data/roleTiles` is the same feature and the same kind of path, so it doesn't cross a boundary.
- **Mapping:** a crew slot stores the legacy category string (e.g. `'Video Photographer'`), and `CATEGORIES.find(c => c.key === category)?.glyph` finds its glyph.
- **Not a "tile in a tile" case**, so I'm not stopping on this point.
  - Strictly, step 2 shows the tile art, not the glyph.
  - The glyph is the same mark without its plate.
- **The other set, `CATEGORY_ICON`** (`blue-*.png`, used on step 3 and in the role picker): a different drawing of each role, not step 2's. I'd use the glyphs.

## 4. Is "אנשי צוות דרושים · 10" computed?
- **Yes:** `totalPeople = slots.reduce((sum, s) => sum + s.quantity, 0)`.
- **Today** it's joined into the title string as `` `${section_crew} · ${totalPeople}` ``.
- **Step 2** splits it into a separate count beside the title, as specified.

## 5. Crew rows: specialization and quantity
- **One row per category**, not per slot. `[...new Set(slots.map(s => s.category))]`, then `forCategory = slots.filter(...)`.
- **Line 2 is already separate.** It's built from each slot's:
  - `requiredCapability`: turned into a label by `capabilityLabel(category, requiredCapability, lang)`, or "General" when there isn't one
  - `quantity`: shown as `${quantity} ${t('builder.people_suffix')}`
  - The pieces are joined with `" · "`.
- **The fields:**
  - `slot.category`: the legacy string
  - `slot.requiredCapability?`
  - `slot.quantity`
- **A category with two specializations** already reads `כללי · 2 אנשי · תאורה · 1 אנשי` on one line. That's the existing line-2 text, kept as is.

## Things to decide before Step 2
- **A. Back chevron in RTL.**
  - The spec says the chevron must point toward the trailing edge in RTL. In Hebrew the trailing edge is the left, so that would be `‹`.
  - The usual Hebrew back arrow points right (`›`, toward the leading edge), which is what steps 2–3 of the wizard use today.
  - My reading is that you mean it should point back out of the flow: `›` in Hebrew, `‹` in English, with the link at the leading edge (right in Hebrew). Please confirm.
- **B. "Project name" doesn't fit 74pt in English.**

  | Label (12pt) | Width |
  |---|---|
  | Project name (Montserrat) | 81pt |
  | Description (Montserrat) | 69pt |
  | שם הפרויקט (Heebo) | 64pt |
  | תאריך ביצוע (Heebo) | 63pt |
  | "Execution" (the actual English label, not "Execution date") | 59pt |

  - Per your rule I'd widen the column to **84pt**, in both languages so the rows line up.
- **C. The 4th section.** A "פרטי תפקידים" / Role details card appears only when the project has role answers. The spec doesn't mention it. I'd give it the same card shell and one-row label/value layout, with no עריכה button (it has none today).
- **D. The "flexible" deadline chip.** The code still renders a grey chip when `deadline === 'flexible'`. The wizard no longer offers "flexible", but old projects edited here could still have it. I'd show it as a plain value in that row, not a chip.
- **E. Disabled publish button.** Today it's the same fill at `opacity 0.4`. I'd keep that: solid `#6D28D9` at 0.4.
