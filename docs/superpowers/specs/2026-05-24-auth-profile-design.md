# Auth + Professional Profile — Design Spec

**Date:** 2026-05-24
**Scope:** Auth screens (login, register, forgot password) + Professional profile screen (view/edit, tabs, rating, portfolio)

---

## Overview

Two tightly connected features built in sequence. Auth gates the entire app; the professional profile is the immediate post-registration destination for professional users. Both are implemented before any other feature so the full user journey (sign up → onboard → be discoverable) is functional end-to-end.

---

## Auth Screens

### Structure

Three screens inside the `/(auth)/` stack (`headerShown: false`). Navigation between them uses `router.push`.

| Route | Screen |
|---|---|
| `/(auth)/` | Login |
| `/(auth)/register` | Register |
| `/(auth)/forgot-password` | Forgot Password |

### Login (`/(auth)/index.tsx`)

- Email + password fields
- "Sign In" button
- "Don't have an account? Register" link → `/(auth)/register`
- "Forgot password?" link → `/(auth)/forgot-password`
- On success: `authStore` is updated by the existing `useAuth` listener; `app/index.tsx` handles the redirect based on role

### Register (`/(auth)/register.tsx`)

- Full name, email, password fields
- Role selector (segmented control: **Client** | **Professional**) above the submit button
- On submit:
  1. Call `signUp(email, password)` → Firebase Auth user created
  2. Immediately write `users/{uid}` Firestore document: `{ id, email, displayName: fullName, photoURL: null, role, createdAt }` — must happen before `onAuthStateChanged` fires to avoid a race where `useAuth` reads a non-existent doc
  3. Update `authStore` with user + role directly in `useRegister` (don't wait for `useAuth` listener)
  4. If role is `professional`: set `uiStore.isNewProfessional = true`, redirect to `/(professional)/(tabs)/profile/`
  5. If role is `client`: redirect to `/(client)/(tabs)/browse/`

### Forgot Password (`/(auth)/forgot-password.tsx`)

- Email field
- "Send reset link" button
- Calls Firebase `sendPasswordResetEmail()`
- On success: replace form with a confirmation message ("Check your inbox")
- "Back to login" link

---

## Post-Auth Routing

`app/index.tsx` already handles routing for returning users (loading spinner → auth or role-based tab). No changes needed there.

The new case is **post-registration**:
- `useRegister` sets `uiStore.isNewProfessional = true` before redirecting professionals
- `/(professional)/(tabs)/profile/index.tsx` reads this flag on mount — if `true`, opens in edit mode and clears the flag; if `false`, opens in view mode
- Client registration redirects directly to `/(client)/(tabs)/browse/` — no flag, no setup step

---

## Professional Profile Screen

### Overview

Single screen (`/(professional)/(tabs)/profile/index.tsx`) with two states: **view** and **edit**. An "Edit" button in the top-right header corner toggles between them. On first visit after registration, opens in edit mode via the `isNewProfessional` flag.

In edit mode: a **Save** button and a **Cancel** button replace the Edit button. Save writes changes to Firestore. Cancel discards local state.

### Layout (top to bottom)

1. **Profile header** — circular photo; tappable in edit mode to pick from camera roll. Full name displayed below; plain text in view, `TextInput` in edit.

2. **Roles** — multi-select chip list from a predefined category list (categories to be defined by product before implementation). In view mode: selected roles shown as read-only `Badge` components. In edit mode: all available options shown as tappable chips to toggle on/off.

3. **Bio** — freetext paragraph. Read-only `Text` in view mode, multiline `TextInput` in edit.

4. **Content tabs** — three pill toggles: **Equipment** | **Price List** | **Reviews**. Switching tabs swaps content inline within the scroll. The active tab's content sits between the pills and the star rating row.
   - **Equipment**: flat list of strings (gear and software). In edit mode: add new item via text input + "Add" button; existing items show a remove (×) icon.
   - **Price List**: list of `{ service: string; price: number }` entries. In edit mode: add via service name + price inputs; existing entries show a remove icon.
   - **Reviews**: list of review cards (author name, star rating, body, date). Always read-only — not editable even in edit mode.

5. **Star rating** — 5 stars filled proportionally from the aggregate `rating` double on the profile doc. Always read-only. Always visible regardless of active tab.

6. **Portfolio** — 2-column photo grid. No cap on number of images. In view mode: tapping a photo opens it full-screen. In edit mode: a "+" tile appears first to trigger image upload; existing photos show a delete (×) icon overlay.

---

## Data Model

### Type additions

**`PriceEntry`** (new, in `src/core/types/project.ts`):
```ts
export type PriceEntry = {
  service: string;
  price: number;
};
```

**`Review`** (new, in `src/core/types/project.ts`):
```ts
export type Review = {
  id: ID;
  professionalId: ID;
  authorId: ID;
  authorName: string;
  rating: number;       // integer 1–5 (what a reviewer submits)
  body: string;
  createdAt: Timestamp;
};
```

**`ProfessionalProfile`** (extended in `src/core/types/user.ts`) — add `equipment` and `priceList`, and remove `hourlyRate` (superseded by `priceList`):
```ts
equipment: string[];
priceList: PriceEntry[];
// existing: roles, bio, availability, rating (double), reviewCount
// removed: hourlyRate (replaced by priceList)
```

**`rating` semantics:**
- `Review.rating` — integer (1–5), submitted by reviewer
- `ProfessionalProfile.rating` — double (e.g. 4.3), computed average across all reviews

### Firestore structure

| Path | Contents |
|---|---|
| `users/{uid}` | Base user doc — written on registration |
| `users/{uid}/profile` | Professional profile sub-document (roles, bio, equipment, priceList, rating, reviewCount) |
| `users/{uid}/portfolio/{assetId}` | One doc per portfolio photo (url, thumbnailUrl, uploadedAt) |
| `reviews/{reviewId}` | Top-level collection, queried by `professionalId` field |

### `uiStore` addition

Add `isNewProfessional: boolean` (default `false`) and `setNewProfessional(val: boolean)` action.

### `constants.ts` change

Remove `MAX_PORTFOLIO_ASSETS = 50` — no cap on portfolio images.

---

## Components & File Structure

### Auth feature

```
src/features/auth/
  components/
    LoginForm.tsx
    RegisterForm.tsx
    RoleSelector.tsx          # segmented control: Client | Professional
    ForgotPasswordForm.tsx
  hooks/
    useLogin.ts               # signIn() → authStore → redirect
    useRegister.ts            # signUp() → write users/{uid} → flag → redirect
    useForgotPassword.ts      # sendPasswordResetEmail()
```

Route screens (thin shells, no logic):
```
src/app/(auth)/index.tsx
src/app/(auth)/register.tsx
src/app/(auth)/forgot-password.tsx
```

### Profile feature

```
src/features/profile/
  components/
    ProfileHeader.tsx         # photo + name, edit-aware
    RoleChips.tsx             # multi-select chip list, edit-aware
    BioSection.tsx            # Text / TextInput toggle
    ContentTabs.tsx           # Equipment | Price List | Reviews pill switcher
    EquipmentList.tsx         # string list, add/remove in edit
    PriceList.tsx             # PriceEntry list, add/remove in edit
    ReviewsList.tsx           # read-only review cards
    StarRating.tsx            # 5-star proportional display, always read-only
    PortfolioGrid.tsx         # 2-column grid, upload + delete in edit, unlimited images
  hooks/
    useProfile.ts             # subscribes to users/{uid}/profile, handles save
    usePortfolio.ts           # subscribes to users/{uid}/portfolio, handles upload/delete
```

Route screen:
```
src/app/(professional)/(tabs)/profile/index.tsx
```

### Cloud Functions addition

```
functions/src/reviews/index.ts    # onReviewCreate → recomputes rating (double) + reviewCount on profile doc
```

---

## Data Flow

```
Auth screens
  → features/auth/hooks/ (useLogin, useRegister, useForgotPassword)
    → core/firebase/auth.ts (signIn, signUp, sendPasswordResetEmail)
    → core/firebase/firestore.ts (setDocument for user doc)
    → core/stores/authStore (setUser, setRole)
    → core/stores/uiStore (setNewProfessional)
      → Expo Router redirect

Profile screen
  → features/profile/hooks/useProfile
    → core/firebase/firestore.ts (subscribeToDocument, updateDocument)
  → features/profile/hooks/usePortfolio
    → core/firebase/storage.ts (uploadFile, deleteFile)
    → core/firebase/firestore.ts (setDocument, deleteDocument for portfolio collection)
```

---

## Out of Scope

- Client profile screen (separate feature)
- Review submission UI (separate feature — reviews collection is read here, not written)
- Push notifications for new reviews
- Role categories list — to be defined by product and provided before implementation begins
