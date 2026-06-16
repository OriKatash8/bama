# Noticeboard Vacancy Filtering

**Date:** 2026-06-16
**Status:** Approved

## Problem

The noticeboard shows all projects with `status == 'open'`, but a project's status never changes when slots are filled — it stays `'open'` indefinitely. This means professionals see projects where every role is already taken and can attempt to bid on filled slots.

## Goal

- Hide projects from the noticeboard once all their roles are filled.
- Show partially-filled projects but only expose the roles that still have vacancies.
- Prevent professionals from submitting offers for already-taken roles.

## Data Model

`ProjectRequest` already contains everything needed:

- `crewSlots: CrewRequestSlot[]` — `{ category, subcategory, quantity }` — total roles required
- `filledSlots: FilledSlot[]` — `{ category, subcategory, professionalId }` — one entry per accepted professional

A slot is **vacant** when:
```
filledSlots.filter(f => f.category === slot.category && f.subcategory === slot.subcategory).length < slot.quantity
```

A project is **fully booked** when every slot has zero vacancies.

## Solution: Client-Side Filtering (Option 1)

No Firestore writes or extra queries. The `filledSlots` array is already delivered in real-time by the existing Firestore subscription in `useNoticeboard`.

### Helper: `getVacantSlots`

Exported from `useNoticeboard.ts`. Returns only the slots that still have openings, with `quantity` updated to reflect remaining vacancies:

```ts
export function getVacantSlots(request: ProjectRequest): CrewRequestSlot[] {
  return request.crewSlots
    .map(slot => {
      const filled = request.filledSlots.filter(
        f => f.category === slot.category && f.subcategory === slot.subcategory
      ).length;
      return { ...slot, quantity: slot.quantity - filled };
    })
    .filter(slot => slot.quantity > 0);
}
```

### Changes

**`src/features/noticeboard/hooks/useNoticeboard.ts`**
- Export `getVacantSlots`
- After sorting, filter `data` to only projects where `getVacantSlots(r).length > 0`

**`src/features/noticeboard/components/ProjectDetailModal.tsx`**
- Import `getVacantSlots`
- `openBid()` initializes bids from `getVacantSlots(request)` instead of `request.crewSlots`
- Bid rows show remaining quantity (e.g. "1 needed" not "3 needed")

**`src/features/noticeboard/components/NoticeBoardCard.tsx`**
- Import `getVacantSlots`
- `roleCount` counts vacant roles only, so the subtitle accurately reflects open positions

## Behaviour

| Scenario | Result |
|---|---|
| All slots filled | Project disappears from noticeboard in real-time |
| Some slots filled | Project stays visible; bid screen shows only open roles |
| Slot quantity > 1, partially filled | Remaining count shown (e.g. "1×" not "3×") |
| Professional opens bid screen | Only biddable roles appear — no way to offer on a taken role |

## Out of Scope

- Changing project `status` to `'in_progress'` when fully booked (separate data-integrity improvement)
- Preventing duplicate offers from the same professional (separate concern)
