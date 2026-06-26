# ContentTabs Expand-from-Origin Animation

**Date:** 2026-06-26  
**File affected:** `src/features/profile/components/ContentTabs.tsx`

## Goal

When the user taps Equipment, Price List, or Reviews on the professional profile, the content panel expands inline (within the scroll view) at full container width. The expansion animates `scaleX` from 0 → 1, anchored to the horizontal position of the tapped tab, so the panel visually "grows out of" that button.

## Layout

Three equal-width tabs in a row (each ~1/3 of container width):

```
[ Equipment (left) ][ Price List (center) ][ Reviews (right) ]
[          full-width panel below           ]
```

The panel sits directly below the row, full width, styled with a border that connects to the active tab.

## Animation

### Transform origin trick

React Native's `transform` anchor is always the element center. To fake a left/center/right origin we pair `scaleX` with a `translateX` that cancels the center-anchor offset:

| Tab        | Relative origin `r` | `translateX` during animation              |
|------------|---------------------|--------------------------------------------|
| Equipment  | 1/6                 | `+(panelWidth / 3) × (1 − scale)`          |
| Price List | 1/2                 | `0`                                        |
| Reviews    | 5/6                 | `−(panelWidth / 3) × (1 − scale)`         |

General formula: `translateX = (0.5 − r) × panelWidth × (1 − scale)`

### Timing

| Action         | Duration | Easing    |
|----------------|----------|-----------|
| Open           | 220 ms   | ease-out  |
| Close          | 120 ms   | ease-in   |
| Switch (close) | 120 ms   | ease-in   |
| Switch (open)  | 220 ms   | ease-out  |

## State

| Variable       | Type                        | Purpose                                              |
|----------------|-----------------------------|------------------------------------------------------|
| `open`         | `SectionKey \| null`        | User's last intent (which tab was tapped)            |
| `displayOpen`  | `SectionKey \| null`        | What is currently rendered in the panel              |
| `scaleAnim`    | `Animated.Value` (0–1)      | Drives both `scaleX` and `translateX`                |
| `panelWidth`   | `number`                    | Measured via `onLayout` on the tab row container     |

## Interaction flows

1. **Open from closed:** Set `displayOpen = newTab` → animate scale 0 → 1.
2. **Close (tap active tab):** Animate scale 1 → 0 → set `displayOpen = null`.
3. **Switch tabs:** Animate scale 1 → 0 → set `displayOpen = newTab` → animate scale 0 → 1.

## Scope

- Changes confined to `ContentTabs.tsx`.
- `EquipmentList`, `PriceList`, `ReviewsList`, and the profile screen are untouched.
- No new dependencies — uses `Animated` from `react-native` (already available).
