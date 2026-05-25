# Profile Screens — Design Spec

**Date:** 2026-05-25
**Scope:** Client profile screen + Professional profile screen (implementation of existing professional spec)

---

## Overview

Two separate profile screens, one per role. Both follow a view/edit toggle pattern. They share one component (`ProfileHeader`) and have separate hooks. The professional profile implements the design already established in `2026-05-24-auth-profile-design.md`. The client profile is new and minimal — photo and name only.

---

## Architecture

```
src/features/profile/
  components/
    ProfileHeader.tsx        # shared — circular photo + name, edit-aware
    RoleChips.tsx            # professional only
    BioSection.tsx           # professional only
    ContentTabs.tsx          # professional only
    EquipmentList.tsx        # professional only
    PriceList.tsx            # professional only
    ReviewsList.tsx          # professional only
    StarRating.tsx           # professional only
    PortfolioGrid.tsx        # professional only
    index.ts
  hooks/
    useClientProfile.ts      # load/save photo + name from users/{uid}
    useProfile.ts            # professional profile sub-doc subscribe + save
    usePortfolio.ts          # portfolio collection subscribe + upload/delete
    index.ts
```

Route screens (thin shells, no logic):
```
src/app/(client)/(tabs)/profile/index.tsx
src/app/(professional)/(tabs)/profile/index.tsx
```

---

## Client Profile Screen

**Route:** `/(client)/(tabs)/profile/index.tsx`

### Layout

- Centered circular avatar (`user.photoURL`, fallback to initials)
- Display name below the avatar
- "Edit" button in the top-right header corner

### View mode

Avatar and name are read-only.

### Edit mode

- Avatar is tappable — opens `expo-image-picker` (camera roll)
- Name becomes a `TextInput`
- "Save" and "Cancel" replace the Edit button in the header
- Save: uploads new photo to Firebase Storage (if changed) → gets download URL → writes `{ displayName, photoURL }` to `users/{uid}` → updates `authStore.setUser(...)`

### Hook — `useClientProfile`

- Reads `user` from `authStore` — no extra Firestore subscribe needed (doc already loaded by `useAuth`)
- `save(name, photoURL)` — calls `updateDocument('users', uid, { displayName, photoURL })` then updates the store
- Exposes `isLoading` and `error`

---

## Professional Profile Screen

**Route:** `/(professional)/(tabs)/profile/index.tsx`

Implements the spec from `2026-05-24-auth-profile-design.md` exactly.

### Layout (top to bottom)

1. **ProfileHeader** — shared component. Circular photo + name. Photo tappable in edit mode. Name is `TextInput` in edit mode.
2. **RoleChips** — selected roles as read-only `Badge` in view; tappable chip toggles in edit.
3. **BioSection** — read-only `Text` in view; multiline `TextInput` in edit.
4. **ContentTabs** — pill switcher: **Equipment | Price List | Reviews**
   - **Equipment** — flat list of strings. Edit: add via text input + "Add" button; existing items show ×.
   - **Price List** — list of `{ service: string; price: number }`. Edit: add via service + price inputs; existing entries show ×.
   - **Reviews** — read-only cards (author name, star rating, body, date). Always read-only, even in edit mode.
5. **StarRating** — 5-star display proportional to `profile.rating` (double). Always read-only.
6. **PortfolioGrid** — 2-column photo grid. View: tap photo to open full-screen. Edit: "+" tile first to trigger upload; existing photos show × overlay. No cap on images.

### Edit mode

"Edit" button in top-right header corner. In edit mode, "Save" and "Cancel" replace it. Save writes all changes to Firestore. Cancel discards local state.

### First-visit flow

On mount, if `uiStore.isNewProfessional === true`, open directly in edit mode and clear the flag.

### Hooks

**`useProfile`**
- Subscribes to `users/{uid}/profile` sub-document
- `save(profile)` — calls `updateDocument` on the sub-doc
- Exposes `profile`, `isLoading`, `error`

**`usePortfolio`**
- Subscribes to `users/{uid}/portfolio` collection
- `upload(imageUri)` — uploads to Storage → writes asset doc to Firestore
- `remove(assetId)` — deletes from Storage + Firestore
- Exposes `assets`, `isLoading`

---

## Data Model

### Type additions (in `src/core/types/project.ts`)

```ts
export type PriceEntry = {
  service: string;
  price: number;
};

export type Review = {
  id: ID;
  professionalId: ID;
  authorId: ID;
  authorName: string;
  rating: number;       // integer 1–5
  body: string;
  createdAt: Timestamp;
};
```

### `ProfessionalProfile` extension (in `src/core/types/user.ts`)

Add:
```ts
equipment: string[];
priceList: PriceEntry[];
```

Remove `hourlyRate` (superseded by `priceList`).

### Firestore structure

| Path | Contents |
|---|---|
| `users/{uid}` | Base user doc — `displayName`, `photoURL`, `role`, `email`, `createdAt` |
| `users/{uid}/profile` | Professional profile sub-doc — `roles`, `bio`, `equipment`, `priceList`, `availability`, `rating`, `reviewCount` |
| `users/{uid}/portfolio/{assetId}` | One doc per portfolio asset — `url`, `thumbnailUrl`, `type`, `uploadedAt` |
| `reviews/{reviewId}` | Top-level collection, queried by `professionalId` |

### `rating` semantics

- `Review.rating` — integer (1–5), submitted by reviewer
- `ProfessionalProfile.rating` — double (e.g. 4.3), computed average; updated by Cloud Function on review create

---

## Shared Component: ProfileHeader

```
Props:
  photoURL: string | null
  name: string
  isEditing: boolean
  onPhotoPress?: () => void       # called in edit mode when avatar tapped
  onNameChange?: (v: string) => void
```

Used by both screens. In view mode: read-only avatar + name. In edit mode: tappable avatar, `TextInput` for name.

---

## Out of Scope

- Review submission UI (reviews are read here, not written)
- Client company name, bio, project count (client profile is photo + name only)
- Push notifications for new reviews
- Role categories list — to be provided by product before implementation
