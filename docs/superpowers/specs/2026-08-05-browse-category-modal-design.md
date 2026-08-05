# Browse Page — Category Modal Design

**Date:** 2026-08-05

## Goal

Replace the subcategory accordion on both browse pages with a flat category list. Tapping a category opens a modal popup containing a pill search bar and a scrollable list of professionals for that category.

## Scope

- `src/app/(client)/(tabs)/browse/index.tsx`
- `src/app/(professional)/(tabs)/browse/index.tsx`

Professional skills display (RoleChips, ContentTabs, ProfessionalCard) is already category-only from the previous refactor — no changes needed there.

---

## Current Behaviour

Both pages show an animated accordion:
- Tap category → expands to reveal subcategory rows
- Tap subcategory → navigates to an inline results view (replaces the grid)

## New Behaviour

### Category list (main grid)

- Flat, non-expandable list — no chevron, no subcategory rows, no accordion animation state
- Client page: keeps card+image style (`categoryCard` with icon), tap anywhere on the card → open modal
- Professional page: keeps plain row style, tap row → open modal
- Existing top search bar stays unchanged (searches name/category, shows inline results outside the modal)

### Category results modal

Opens on category tap. A standard React Native `Modal` (transparent, animationType `slide`):

**Header:**
- Category name (bold, `#004aad`)
- `✕` close button (top-right)

**Search bar (pill style):**
- Rounded (`borderRadius: 24`), white background, `Search` icon on the left
- Filters the results list by professional display name (client-side filter on already-loaded results)
- Clears on modal close

**Results list:**
- `FlatList` of `ProfessionalCard` items filtered to the selected category
- Data comes from `useSearchProfessionals(selectedCategory)` — subcategory param omitted
- Loading spinner while fetching
- Empty state: icon + "No professionals yet" text

**Card actions inside the modal:**
- Client page: "Direct Project" button on the card → opens `DirectProjectSheet` (same as today, sheet sits above the modal)
- Professional page: "Message" button → `getOrCreateDM` then navigate to chat

**Dismiss:** `✕` button, tap outside overlay, or Android back button — clears selected category and local search query.

---

## State changes

### Client browse

Remove:
- `expandedCategory` state
- `animValues` ref
- `toggleCategory` function
- `ViewState` type and `view` state (the modal replaces the inline results view)
- `subResults` / `subLoading` from `useSearchProfessionals` (called inside modal instead)
- `filteredCategories` subcategory filter branch
- `inResultsView`, `showGrid` derived booleans

Add:
- `selectedCategory: string | null` state (null = modal closed)
- `modalQuery: string` state (search within modal)

Keep:
- Top search bar + `useUnifiedSearch` for name/category search
- `DirectProjectSheet` logic

### Professional browse

Remove:
- `expandedCategory` state
- `animValues` ref
- `toggleCategory` function
- `ViewState` type and `view` state
- `ResultsView` component (inline — replace with modal)
- `getSearchTarget` function and subcategory-based search hint
- `searchTarget` logic

Add:
- `selectedCategory: string | null` state
- `modalQuery: string` state

Keep:
- Top search bar (can search by name)

---

## Data layer

`useSearchProfessionals(category)` already works category-only — subcategory param is optional and was already made a no-op in the previous refactor. No hook changes needed.

---

## TypeScript constraints

- No `any` — remove all `(view as any).subcategory` casts (they disappear with `ViewState`)
- `tsc --noEmit` must pass zero errors after changes

---

## Out of scope

- Dark mode styling changes
- Marketplace pages (separate product domain)
- Any changes to `useSearchProfessionals`, `useUnifiedSearch`, or `ProfessionalCard`
