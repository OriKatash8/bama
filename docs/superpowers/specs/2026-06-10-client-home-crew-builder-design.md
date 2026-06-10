# Client Home & Crew Builder — Design Spec

**Date:** 2026-06-10
**Status:** Approved

---

## Overview

Replace the client "Bookings" and "Crew" tabs with a single **Home** tab. Home is a dashboard showing the client's submitted project requests, with a "Build Crew" flow for creating new ones. A submitted request becomes a job posting visible to professionals on their side of the app.

---

## Tab Structure

**Before:** Browse → Crew → Bookings → Profile → Switch  
**After:** Browse → Home → Profile → Switch

- Remove `src/app/(client)/(tabs)/crew/` route and tab entry
- Remove `src/app/(client)/(tabs)/bookings/` route and tab entry
- Add `src/app/(client)/(tabs)/home/` route with title "Home"

---

## Screens & Navigation

The Home tab is a **stack** (not a modal). Three screens in order:

| Route | Screen | Purpose |
|---|---|---|
| `(tabs)/home/index.tsx` | Dashboard | List of submitted project requests + "Build Crew" CTA |
| `(tabs)/home/builder.tsx` | Crew Builder | Step 1 — category accordion + crew basket |
| `(tabs)/home/details.tsx` | Project Details | Step 2 — date, location, budget, description form |

Flow: Dashboard → (tap "Build Crew") → Builder → (tap "Next") → Details → (tap "Submit") → back to Dashboard (new request appears at top).

---

## Data Structure

### Categories — `src/features/crew/data/categories.ts`

Static constant, keyed by parent category name. Adding/removing a role is a one-line edit with no UI changes required.

```ts
export const CREW_CATEGORIES: Record<string, string[]> = {
  'Video Photographer': [
    'Music Video', 'Event', 'Fashion', 'Food', 'Product', 'Sports',
    'Concert', 'Documentary', 'Drone', 'Social Media', 'Other',
  ],
  'Still Photographer': [
    'Fashion', 'Product', 'Food', 'Portrait', 'Corporate Headshot',
    'Event', 'Concert', 'Party', 'Sports', 'Real Estate', 'Nature',
    'Journalism', 'Other',
  ],
  'Editor': [
    'Video Editor', 'Photo Editor', 'Colorist', 'Sound Editor', 'Animator',
    'VFX Artist', 'CGI Specialist', 'Effects Designer', 'Subtitle Creator',
    'TikTok/Reels Editor', 'YouTube Editor',
  ],
  'Graphic Designer': [
    'Graphic Designer', 'Cover Art', 'Logo Designer', 'Poster Designer',
    'Illustrator', 'UI/UX Designer', 'Presentation Designer',
    'Branding Specialist', 'Animator', 'Motion Graphics',
  ],
  'AI Specialist': ['AI Images', 'AI Videos'],
  'Social Media': [
    'Social Media Manager', 'Content Creator', 'Campaign Manager',
    'TikToker', 'Reels Creator', 'Instagram Manager', 'YouTube Expert',
    'SEO Specialist', 'Copywriter', 'Digital Marketer',
  ],
  'Studio & Audio': [
    'Recording Studio', 'Music Producer', 'Songwriter', 'Composer',
    'Backup Singer', 'Rapper', 'DJ', 'Guitarist', 'Pianist', 'Drummer',
    'Violinist', 'Saxophonist', 'Voiceover Artist', 'Dubbing Artist',
    'Beatmaker', 'Studio Technician',
  ],
  'Lighting Tech': [
    'Studio/Commercial', 'Event', 'Stage/Concert', 'Gaffer', 'Other',
  ],
  'Sound Recordist': [
    'Field Recordist (Film/TV)', 'Live Event Sound Tech',
    'Post-Production Mixer', 'Podcast/Interview Tech', 'Other',
  ],
};
```

### Types — additions to `src/core/types/project.ts`

```ts
export interface CrewSlot {
  category: string;    // parent category name
  subcategory: string; // sub-category name
  quantity: number;    // minimum 1
}

export interface ProjectRequest {
  id: string;
  clientId: string;
  crewSlots: CrewSlot[];
  description: string;
  date: string;        // ISO date string (YYYY-MM-DD)
  location: string;
  budget: number;      // in local currency, whole number
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Timestamp;
}
```

### Firestore

Collection: `projects/{projectId}` (top-level).

Client dashboard queries: `where('clientId', '==', currentUser.id)`, ordered by `createdAt` descending.  
Professionals query later by matching their subcategory against `crewSlots`.

---

## Feature Module — `src/features/crew/`

The tab is removed but the feature module stays and gains its full implementation.

### Components

| Component | Responsibility |
|---|---|
| `CategoryAccordion` | Renders the full list of parent categories; manages which one is expanded (single open at a time) |
| `CategoryItem` | Single parent row — tap toggles expand/collapse; shows sub-category list when open |
| `SubCategoryRow` | Tappable sub-category; shows quantity badge if already in basket; each tap adds one slot |
| `CrewBasket` | Sticky bottom strip — total slot count + "Next" button; disabled when basket is empty |
| `ProjectRequestCard` | Card showing a submitted request: role summary, date, location, status badge |
| `ProjectDetailsForm` | Step 2 form: text description, date picker, location text input, numeric budget input |

### Hooks

**`useCrewBuilder`** — local (no Firestore). Manages basket state:
- State: `slots: CrewSlot[]`
- Actions: `addSlot(category, subcategory)` — increments quantity if slot exists, else appends; `removeSlot(category, subcategory)`; `reset()`
- Derived: `totalCount` (sum of all quantities)

**`useProjectRequests`** — Firestore-backed:
- Subscribes to client's projects via `subscribeToCollection`
- Returns: `requests: ProjectRequest[]`, `isLoading`, `error`
- Action: `submit(slots, details)` — writes new document to `projects/`, status `'open'`

---

## Screen Designs

### Dashboard (`home/index.tsx`)
- Header: "Home"
- If no requests: empty state ("No projects yet. Build your first crew.")
- If requests: `FlatList` of `ProjectRequestCard`, newest first
- Floating or header "Build Crew" button → pushes to `builder`
- No local state; pulls from `useProjectRequests`

### Crew Builder (`home/builder.tsx`)
- `ScrollView` of `CategoryAccordion`
- `CrewBasket` pinned to bottom (above keyboard/tab bar)
- "Next" in basket is disabled until at least one slot is selected
- On "Next": passes `slots` to `details` screen via route params (serialized)

### Project Details (`home/details.tsx`)
- Receives `slots` from params
- `ProjectDetailsForm` — description, date, location, budget
- "Submit" calls `useProjectRequests.submit()`, then navigates back to dashboard
- Shows inline loading state while submitting; shows error toast on failure

---

## Error Handling

- Submit failure: toast via `useUiStore.showToast`
- Empty basket: "Next" button disabled — no runtime guard needed
- Required fields in details form: validate before submit; inline error messages under each field

---

## Testing

- `useCrewBuilder` — unit test: add, increment, remove, reset
- `useProjectRequests` — integration test with Firestore emulator: subscribe, submit
- `CategoryAccordion` — snapshot test: expand/collapse behavior
