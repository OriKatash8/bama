# Role Picker Grid — Design Spec

**Date:** 2026-06-24
**Status:** Approved

## Overview

Inside the "Build Your Crew" page, tapping a category tile (e.g. Videographer) opens a modal panel listing that category's subcategory roles. Currently those roles appear as a vertical list with `+/−` row controls. This spec replaces that list with a 3-column grid of small square tiles.

## Layout

The panel `ScrollView` content changes from a `subRow` list to a flex-wrap grid:

- `flexDirection: 'row'`, `flexWrap: 'wrap'`, `gap: 8` (horizontal and vertical)
- 3 columns per row
- Tile size: `(panelInnerWidth - 2 × 8) / 3` — equal width and height (square)
- `panelInnerWidth` = panel width minus its horizontal padding (20px each side)
- On a typical 390px phone the panel occupies most of the screen width (accounting for 24px screen padding each side from the backdrop), giving tiles of roughly 90–100px per side

The hint text above the grid changes from "Tap + to add roles" to "Tap to add · tap badge to remove".

## Tile Design

Each tile is a `TouchableOpacity` wrapping:

```
┌─────────────────┐
│              [2]│  ← count badge (accent circle, top-right), hidden when qty = 0
│                 │
│   Role Name     │  ← centered text, fontSize 11, fontWeight 600, numberOfLines 2
│                 │
└─────────────────┘
```

**Unselected (qty = 0)**
- Background: card color (same as panel)
- Border: 1.5px `colors.border`
- No badge

**Selected (qty ≥ 1)**
- Background: `colors.accent + '18'` (light accent tint)
- Border: 1.5px `colors.accent`
- Count badge: small circle (`colors.accent` fill, white text) anchored top-right corner (`position: absolute`, `top: -6`, `right: -6`)

## Interaction

| Action | Effect |
|---|---|
| Tap tile | `addSlot(selectedCategory.key, sub)` → qty++ |
| Tap count badge | `removeSlot(selectedCategory.key, sub)` → qty-- (badge hidden at 0) |

The count badge has its own `TouchableOpacity` with `onPress` that stops propagation so tapping it doesn't also trigger the tile's `onPress`.

## Files Changed

| File | Change |
|---|---|
| `src/app/(client)/(tabs)/home/index.tsx` | Replace `subRow` list with 3-column square tile grid inside modal `ScrollView`; update hint text; add tile and badge styles |

## Out of Scope

- Changes to the outer category tile grid (the 9 main category squares)
- Changes to `useCrewBuilder` — `addSlot`/`removeSlot` already handle qty correctly
- Animation on tile selection
