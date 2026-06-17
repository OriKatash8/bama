# Client Tab Bar Icon Redesign + Chats Tab — Design Spec

**Date:** 2026-06-17
**Scope:** Redesign the client bottom tab bar to use filled icon drawings instead of text labels, matching the dark sign-in page aesthetic. Add a new empty "Chats" placeholder tab.

---

## Overview

The client tab bar currently shows plain text labels (Search, Home, Profile, Switch). This spec replaces those labels with filled icon drawings styled to match the app's dark theme (`#0f0f1f` background, `#cb6ce6` purple accent). A new "Chats" tab is also added as an empty placeholder.

---

## Tab Bar Design

### Background & Border
- Tab bar background: `#0f0f1f`
- Top border: `1px solid rgba(255,255,255,0.08)`
- No visible text labels (`tabBarShowLabel: false`)

### Active Tab Icon
- Icon color: `#cb6ce6` (purple)
- Pill background behind active icon: `rgba(203, 108, 230, 0.2)`, border-radius `18px`, size `44×36px`
- Box shadow / glow: `0 0 14px rgba(203, 108, 230, 0.35)`
- Small dot indicator (4×4px, border-radius 2px, `#cb6ce6`) centered below the icon

### Inactive Tab Icon
- Icon color: `rgba(255, 255, 255, 0.3)`
- No background pill, no glow

---

## Tabs

Five tabs in order (left to right):

| Tab | Screen | Icon (SF Symbol / Material) | Notes |
|-----|--------|-----------------------------|-------|
| Home | `home` | `house.fill` | |
| Browse | `browse` | `magnifyingglass` | |
| Chats | `chats` | `message.fill` | **New** — empty placeholder |
| Profile | `profile` | `person.fill` | |
| Switch | `switch` | `arrow.left.arrow.right` | Custom `tabBarButton` unchanged |

---

## Icon Rendering

Each tab uses `tabBarIcon` in `Tabs.Screen options`. The icon renderer:

```tsx
tabBarIcon: ({ focused }) => (
  <TabIcon name="house.fill" focused={focused} />
)
```

A shared `TabIcon` component (`src/app/(client)/(tabs)/TabIcon.tsx`) renders:

```tsx
<View style={focused ? styles.activePill : styles.inactivePill}>
  <SymbolView
    name={name}
    size={20}
    tintColor={focused ? '#cb6ce6' : 'rgba(255,255,255,0.3)'}
    type="hierarchical"
  />
</View>
```

Where `styles.activePill` = `{ width:44, height:36, borderRadius:18, backgroundColor:'rgba(203,108,230,0.2)', alignItems:'center', justifyContent:'center', shadowColor:'#cb6ce6', shadowOffset:{width:0,height:0}, shadowOpacity:0.35, shadowRadius:7, elevation:4 }`.

---

## Chats Screen (`src/app/(client)/(tabs)/chats/index.tsx`)

Empty placeholder screen:

- Background: `#0f0f1f`
- Centered content:
  - Large chat icon (`message.fill`, size 48, color `rgba(203,108,230,0.3)`)
  - Title: "No chats yet" (white, bold, 18px)
  - Subtitle: "Your conversations with professionals will appear here" (muted `#888`, 13px, centered)

No functionality — pure placeholder.

---

## Files Changed

| Action | Path |
|--------|------|
| Create | `src/app/(client)/(tabs)/chats/index.tsx` |
| Create | `src/app/(client)/(tabs)/TabIcon.tsx` |
| Modify | `src/app/(client)/(tabs)/_layout.tsx` |

---

## Out of Scope

- Actual chat functionality (future feature)
- Professional tab bar icon redesign (separate task)
- Notification badges on the Chats icon (future)
