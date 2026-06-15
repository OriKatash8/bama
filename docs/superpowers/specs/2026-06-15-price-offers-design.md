# Price Offers & Project Team — Design Spec

**Date:** 2026-06-15
**Status:** Approved

## Overview

Replace the fixed client-set `budget` field with a market-driven bidding system. Professionals submit per-role price offers from the notice board; clients accept the best offer per slot; accepted members appear in an expandable team list inside each project card.

---

## 1. Data Model

### Remove from `ProjectRequest`
- `budget: number` — deleted from type and builder form

### Add to `ProjectRequest`
```ts
filledSlots: { category: string; subcategory: string; professionalId: string }[]
```
Populated incrementally as the client accepts offers. Initially `[]`.

### New type: `PriceOffer` (add to `src/core/types/project.ts`)
```ts
export type PriceOffer = {
  id: string;
  projectId: string;
  professionalId: string;
  category: string;       // e.g. "Video Production"
  subcategory: string;    // e.g. "Cinematographer"
  price: number;          // professional's asking price for this slot
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
};
```

**Firestore collection:** `priceOffers`

### Auto-reject rule
When a client accepts offer O for slot `(projectId, category, subcategory)`, a batch write:
1. Sets O's `status → 'accepted'`
2. Sets all other `pending` offers with the same `projectId + category + subcategory` to `'rejected'`
3. Appends `{ category, subcategory, professionalId }` to the project's `filledSlots`

---

## 2. Professional Flow — Notice Board

### `PriceBidModal` (`src/features/noticeboard/components/PriceBidModal.tsx`)
Replaces the "Apply for this project" button inside `ProjectDetailModal`.

- Lists all `crewSlots` from the project
- Each slot has a checkbox and a numeric price input (shown only when checked)
- "Submit Offer" button disabled until ≥ 1 slot is checked with price > 0
- On submit: calls `usePriceOffer.submit()`, then dismisses the card from the board

### `usePriceOffer` (`src/features/noticeboard/hooks/usePriceOffer.ts`)
```ts
submit(projectId: string, slots: { category: string; subcategory: string; price: number }[]): Promise<void>
```
Batch-creates one `priceOffer` document per slot.

### Retired
- `useProjectApplication` hook and `projectApplications` collection are no longer used. The ✓ button on the card now opens `PriceBidModal` instead of directly applying.

---

## 3. Client Flow — Price Offers Section

### Location
New section on the client home page (`src/app/(client)/(tabs)/home/index.tsx`), rendered between the hero card and "My Projects". Hidden entirely when there are no pending offers.

### `usePriceOffers` (`src/features/offers/hooks/usePriceOffers.ts`)
- First queries `projects` where `clientId == currentUser.id` to get the client's project IDs
- Then subscribes to `priceOffers` where `projectId in [...]` and `status == 'pending'`
- Firestore `in` supports up to 30 items — sufficient for typical client project counts
- Returns `{ offers: PriceOffer[]; isLoading: boolean }`

### `useAcceptOffer` (`src/features/offers/hooks/useAcceptOffer.ts`)
```ts
accept(offer: PriceOffer): Promise<void>   // batch: accept + auto-reject others + update filledSlots
reject(offerId: string): Promise<void>     // single: set status to 'rejected'
```

### `PriceOfferCard` (`src/features/offers/components/PriceOfferCard.tsx`)
Displays per pending offer:
- Professional's display name
- Role: `subcategory (category)`
- Price: `$X`
- ✓ accept button (green circle, same style as notice board)
- ✗ reject button (red circle)

Professional name resolved by reading `users/{professionalId}` (simple `getDocument` call, not a subscription).

---

## 4. Project Team List (Client Home)

### `ProjectRequestCard` changes
- Existing card gains a "▾ Team (N)" toggle at the bottom, visible only when `filledSlots.length > 0`
- Expands inline to show accepted members
- Unfilled slots shown as "— Open" in muted text

### `useProjectTeam` (`src/features/offers/hooks/useProjectTeam.ts`)
```ts
useProjectTeam(projectId: string): { team: AcceptedMember[]; isLoading: boolean }

type AcceptedMember = {
  professionalId: string;
  category: string;
  subcategory: string;
  price: number;
  displayName: string;   // resolved from users collection
};
```
Queries `priceOffers` where `projectId == X AND status == 'accepted'`, then resolves display names.

---

## 5. Builder Form Changes

- Remove `budget` field (`TextInput`, label, state variable, validation) from `builder.tsx`
- Remove `budget` from `validate()` logic
- Remove `budget` from `submit()` call
- `ProjectRequest.budget` removed from type — update `submit` in `useProjectRequests` hook accordingly

---

## 6. File Map

| File | Change |
|------|--------|
| `src/core/types/project.ts` | Add `PriceOffer` type; remove `budget` from `ProjectRequest`; add `filledSlots` |
| `src/app/(client)/(tabs)/home/builder.tsx` | Remove budget field + validation |
| `src/app/(client)/(tabs)/home/index.tsx` | Add "Price Offers" section |
| `src/features/crew/components/ProjectRequestCard.tsx` | Add expandable team list |
| `src/features/noticeboard/components/ProjectDetailModal.tsx` | Replace apply button with `PriceBidModal` trigger |
| `src/features/noticeboard/components/PriceBidModal.tsx` | **NEW** — slot checklist + price inputs |
| `src/features/noticeboard/hooks/usePriceOffer.ts` | **NEW** — batch submit offers |
| `src/features/offers/hooks/usePriceOffers.ts` | **NEW** — subscribe to pending offers for client |
| `src/features/offers/hooks/useAcceptOffer.ts` | **NEW** — accept/reject with auto-reject batch |
| `src/features/offers/hooks/useProjectTeam.ts` | **NEW** — query accepted team members |
| `src/features/offers/components/PriceOfferCard.tsx` | **NEW** — offer display card |

---

## 7. Out of Scope

- Professional profile navigation from offer card (no-op tap for now)
- Push notifications when a new offer arrives
- Editing or withdrawing a submitted offer
- `projectApplications` migration (old data left as-is, new flow uses `priceOffers`)
