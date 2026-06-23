# Client Project Edit & Delete — Design Spec

**Date:** 2026-06-23
**Status:** Approved

## Overview

A client who has already submitted a crew request can edit or delete that project from the "My Projects" section in the Notifications tab of the Chats screen. Edit opens the existing crew builder in edit mode (pre-populated). Delete requires confirmation before removing the document.

## Constraints

- Edit and Delete are only available when `request.status === 'open'`.
- Editing allows full changes: title, description, date, location, and crew slots.
- Delete requires a native confirmation dialog before executing.

---

## Section 1: Data Layer

### `useProjectRequests` additions

Two new async functions are added to the existing hook:

**`updateProject(id, slots, details)`**
- Calls `updateDocument('projects/{id}', { crewSlots: slots, ...details })`
- Overwrites the full `crewSlots` array and all text details in one Firestore update
- Throws on failure so the calling screen can catch and show a toast

**`deleteProject(id)`**
- Calls `deleteDocument('projects/{id}')`
- No cascade needed — `crewSlots` and `filledSlots` are embedded in the project document
- Throws on failure so the caller can show a toast

Both functions follow the same error pattern as the existing `submit` function.

---

## Section 2: Builder Screen — Edit Mode

File: `src/app/(client)/(tabs)/home/builder.tsx`

The builder accepts an optional `projectId` param via `useLocalSearchParams()`.

**When `projectId` is present (edit mode):**
1. On mount, fetch the project: `getDocument('projects/{projectId}')`
2. Pre-populate all text fields: `title`, `description`, `date`, `location`
3. Seed `useCrewBuilder` with the project's existing `crewSlots` via a new optional `initialSlots` param
4. Submit button label changes from "Submit Request" to "Save Changes"
5. On submit, call `updateProject(projectId, slots, details)` instead of `submit()`
6. On success, navigate back (`router.dismiss()`) and show a success toast

**When `projectId` is absent (create mode):**
No change to existing behavior.

### `useCrewBuilder` change

Accepts an optional `initialSlots: CrewRequestSlot[]` param. When provided, state is seeded with those slots on initialization. Defaults to `[]` as today.

---

## Section 3: `ProjectRequestCard` UI

File: `src/features/crew/components/ProjectRequestCard.tsx`

When `request.status === 'open'`, an action row appears at the bottom of the card containing two buttons:

**Edit button**
- Label: "Edit"
- Color: accent (`#cb6ce6`)
- Action: `router.push('/builder?projectId={request.id}')`

**Delete button**
- Label: "Delete"
- Color: muted red (`#e53e3e`)
- Action: Shows `Alert.alert('Delete project?', 'This cannot be undone.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: handleDelete }])`
- `handleDelete` calls `deleteProject(request.id)` from `useProjectRequests`, then shows a success or error toast via `useUiStore`

The card calls `useProjectRequests` and `router` directly — no new props required.

---

## Files Changed

| File | Change |
|---|---|
| `src/features/crew/hooks/useProjectRequests.ts` | Add `updateProject`, `deleteProject` |
| `src/features/crew/hooks/useCrewBuilder.ts` | Accept optional `initialSlots` param |
| `src/app/(client)/(tabs)/home/builder.tsx` | Edit mode via `projectId` param |
| `src/features/crew/components/ProjectRequestCard.tsx` | Add Edit/Delete action row for `open` projects |

## Out of Scope

- Editing projects with status `in_progress`, `completed`, or `cancelled`
- Cascading deletes to price offers or bookings referencing the project
- Notifications to professionals when a project they applied to is deleted or edited
