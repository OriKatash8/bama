# Notice Board: Professional Category Filtering

**Date:** 2026-06-23  
**Status:** Approved

## Overview

Notices on the professional dashboard should only appear if the project requires at least one role category that matches the professional's skill categories. A professional with no skills set sees no notices.

## Requirements

- Match is on **category only** (e.g. `"Video Editor"`), not subcategory.
- A project with multiple role categories is visible if the professional matches **any one** of them (OR logic).
- A professional with an empty skills list sees **no notices**.
- Filtering is **client-side** — no Firestore schema changes required.

## Data Model (unchanged)

**Project `crewSlots` field:**
```ts
type CrewRequestSlot = {
  category: string;    // e.g. "Video Editor"
  subcategory: string; // e.g. "Music Video"
  quantity: number;
};
```

**Professional `skills` field:**
```ts
type ProfessionalSkill = {
  category: string;    // e.g. "Video Editor"
  subcategory: string;
};
```

Both sides already share the same category strings from `src/features/crew/data/categories.ts`.

## Architecture

### New pure function — `filterByProfessionalCategories`

Added to `src/features/noticeboard/hooks/useNoticeboard.ts`.

```ts
export function filterByProfessionalCategories(
  requests: ProjectRequest[],
  categories: string[]
): ProjectRequest[] {
  if (categories.length === 0) return [];
  return requests.filter(r =>
    getVacantSlots(r).some(slot => categories.includes(slot.category))
  );
}
```

Applied after the existing sort and vacancy filter inside `useNoticeboard`.

### Updated `useNoticeboard` signature

```ts
export function useNoticeboard(professionalCategories: string[])
```

Internally applies `filterByProfessionalCategories(sorted, professionalCategories)` before returning `requests`.

### Updated `DashboardScreen`

Calls `useProfile()` to get the professional's skills, derives unique categories, passes them to `useNoticeboard`, and combines both loading states:

```ts
const { profile, isLoading: profileLoading } = useProfile();

const categories = useMemo(
  () => [...new Set((profile?.skills ?? []).map(s => s.category))],
  [profile?.skills]
);

const { requests, isLoading: boardLoading } = useNoticeboard(categories);
const isLoading = profileLoading || boardLoading;
```

No JSX changes — existing spinner, empty state, and list handle all cases correctly.

## Error Handling

- Profile fails to load → `profileLoading` stays true, spinner shows indefinitely (existing profile error handling owns recovery).
- Skills field absent on profile document → treated as empty array → no notices shown.

## Testing

New test block in `src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts` covering `filterByProfessionalCategories`:

| Scenario | Expected |
|---|---|
| Project category matches professional's category | Shown |
| Project category does not match | Hidden |
| Professional has no skills (empty array) | Nothing shown |
| Project needs two roles, professional matches only one | Shown |
| Project needs two roles, professional matches neither | Hidden |

## Files Changed

| File | Change |
|---|---|
| `src/features/noticeboard/hooks/useNoticeboard.ts` | Add `filterByProfessionalCategories`; update `useNoticeboard` signature |
| `src/app/(professional)/(tabs)/dashboard/index.tsx` | Add `useProfile`, derive categories, combine loading states |
| `src/features/noticeboard/hooks/__tests__/getVacantSlots.test.ts` | Add test block for `filterByProfessionalCategories` |
