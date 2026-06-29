# Search Professionals — Accordion Category List

**Date:** 2026-06-29  
**File:** `src/app/(client)/(tabs)/browse/index.tsx`

## Goal

Replace the icon grid + subcategory modal with an accordion list: one row per category, tapping expands subcategories inline, tapping again collapses. Only one category open at a time.

## Removed

- Icon grid (`View` + `TouchableOpacity` tiles with `Image`)
- Modal (`Modal`, `Animated.View`, `backdrop`, `panel` styles)
- Animation state: `scaleAnim`, `opacityAnim`, `modalVisible`
- Functions: `openCategory`, `closeModal`
- Styles: `tile`, `tileImage`, `tileOverlay`, `tileLabel`, `backdrop`, `panel`, `panelHeader`, `panelTitle`, `closeBtn`, `panelDivider`, `panelScroll`, `subHint`, `subRow`, `subLabel`, `subArrow`
- `CATEGORY_META` image references (no longer needed)

## State

```ts
const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
```

Toggle logic: if tapped category is already expanded → set to `null`; otherwise → set to tapped category key.

## Layout

```
[ Search bar ]
[ Category row: "Videographer"         › ]
[ Category row: "Photographer"         ⌄ ]  ← expanded
    [ Subcategory row: "Wedding Photography" ]
    [ Subcategory row: "Portrait"            ]
    [ ... ]
[ Category row: "Editor"               › ]
...
```

## Components

**Category row**
- Full-width `TouchableOpacity`
- Left: category label (bold, `#004aad`)
- Right: chevron text `›` (collapsed) / `⌄` (expanded), color `#004aad`
- Bottom border separator

**Subcategory rows** (rendered below parent when `expandedCategory === cat.key`)
- Indented (`paddingLeft: 24`)
- Thin left accent line (`borderLeftWidth: 2, borderLeftColor: '#004aad'`, `marginLeft: 16`)
- Each tappable → calls `setView({ kind: 'results', category, subcategory })`
- Bottom border separator (lighter)

**Animation**
- `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` called before each state update for smooth expand/collapse.
- Requires `UIManager.setLayoutAnimationEnabledExperimental(true)` on Android (guard with `Platform.OS === 'android'`).

## Search bar behaviour

Unchanged — filters `CATEGORIES` list by label/subcategory match. Filtered categories still render as accordion rows.

## ResultsView

Unchanged — selecting a subcategory sets `view` to `{ kind: 'results', category, subcategory }` and renders `ResultsView` as before.

## Styles (new/changed)

| Style | Description |
|---|---|
| `categoryRow` | Full-width row, horizontal flex, padding, bottom border |
| `categoryLabel` | Bold, `#004aad`, Montserrat |
| `categoryChevron` | `#004aad`, fontSize 18 |
| `subList` | Container for subcategory rows |
| `subItem` | Indented row with left accent border |
| `subItemText` | `#004aad`, slightly smaller than category label |
