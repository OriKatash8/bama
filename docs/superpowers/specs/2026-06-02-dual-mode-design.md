# BAMA — Dual-Mode User Architecture

**Date:** 2026-06-02
**Status:** Approved

---

## Overview

Every BAMA user can function as both a **Professional** (receives bookings, manages portfolio) and a **Client** (browses professionals, builds crews). The concept of a fixed `role` assigned at registration is removed. Instead, users choose their active mode each time they launch the app, and can switch mid-session via an Instagram-style bottom sheet.

---

## Design Decisions

- **Approach:** Navigate-on-Switch — two existing Expo Router route groups (`(client)/` and `(professional)/`) are preserved. Mode switching triggers a `router.replace()` to the other group's default screen.
- **Persistence:** `activeMode` is in-memory only (Zustand). It is never written to Firestore. It resets to `null` on each app launch, forcing the user through the mode-select screen.
- **Mode switcher:** A "Switch" tab at the end of both tab bars opens a bottom sheet listing both modes. The active mode shows a checkmark; tapping the other navigates to it.

---

## Schema Changes

### `User` type (`src/core/types/user.ts`)

Remove the `role` field. `activeMode` is not added to this type — it is session state only.

```ts
// Before
export type User = {
  id: ID; email: string; displayName: string;
  photoURL: string | null;
  role: UserRole | null;
  createdAt: Timestamp;
};

// After
export type User = {
  id: ID; email: string; displayName: string;
  photoURL: string | null;
  createdAt: Timestamp;
};
```

Remove `UserRole`. Add `ActiveMode`:

```ts
export type ActiveMode = 'client' | 'professional';
```

`ClientProfile` and `ProfessionalProfile` types are unchanged.

---

## Auth Store (`src/core/stores/authStore.ts`)

Replace `role: UserRole | null` with `activeMode: ActiveMode | null`. Add `setActiveMode` action. Remove `setRole`.

```ts
type AuthState = {
  user: User | null;
  activeMode: ActiveMode | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setActiveMode: (mode: ActiveMode | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
};
```

`clear()` sets `activeMode: null`.

---

## Routing

### `src/app/index.tsx`

```ts
if (!user)               → Redirect to /(auth)/
if (activeMode === null) → Redirect to /(auth)/mode-select
if (activeMode === 'client')       → Redirect to /(client)/(tabs)/browse/
if (activeMode === 'professional') → Redirect to /(professional)/(tabs)/dashboard/
```

### `src/app/(auth)/mode-select.tsx`

Repurposed from one-time setup to a recurring session entry point. Shown every app launch after authentication. The screen presents two cards ("Professional" and "Client"). Tapping one calls `setActiveMode()` in the store and navigates to the corresponding tab group. No Firestore write.

---

## Hooks

### `useAuth` (`src/core/hooks/useAuth.ts`)

- Remove the line that reads `userData.role` and calls `setRole`.
- Add legacy migration: if the fetched user doc contains a `role` field, call `updateDocument` to remove it (one-time, silent).
- Do not set `activeMode` — that is the mode-select screen's job.

### `useSetRole` (`src/features/auth/hooks/useSetRole.ts`)

Deleted. Replaced by `useSwitchMode`.

### `useSwitchMode` (new — `src/features/auth/hooks/useSwitchMode.ts`)

```ts
type SwitchModeState = {
  switchMode: (mode: ActiveMode) => void;
};
```

Calls `setActiveMode(mode)` in the auth store, then `router.replace()` to the target group's default screen. No async, no Firestore.

### `useRegister` (`src/features/auth/hooks/useRegister.ts`)

- Remove `role: null` from the user doc written to Firestore.
- Remove `setRole(null)` call.
- After registration, navigate to `/(auth)/mode-select` (unchanged).

### `useClientProfile` (`src/features/profile/hooks/useClientProfile.ts`)

Extended to subscribe to `users/{id}/clientProfile/data` and expose a `profile: ClientProfile | null` field. The `save` function writes `companyName` and `bio` to that sub-doc (lazy creation on first save), and continues to write `displayName`/`photoURL` to the top-level user doc.

---

## Profile Architecture

Both profile types are stored as Firestore sub-documents under the user doc:

| Sub-doc path | Type | Created |
|---|---|---|
| `users/{id}/profile/data` | `ProfessionalProfile` | Lazy — on first professional profile save |
| `users/{id}/clientProfile/data` | `ClientProfile` | Lazy — on first client profile save |

Sub-docs are `null` until the user saves their profile for that mode. Screens show an empty/setup state when the profile is `null`.

Shared fields (`displayName`, `photoURL`) live on the top-level `users/{id}` doc and are used by both profiles.

---

## Mode Switcher UI

Both `(client)/(tabs)/_layout.tsx` and `(professional)/(tabs)/_layout.tsx` receive a final tab whose `onPress` opens a `Modal` bottom sheet instead of navigating to a screen.

The bottom sheet:
- Lists both modes (Professional and Client) as tappable cards
- Marks the current `activeMode` with a checkmark and accent border
- Tapping the inactive mode calls `useSwitchMode().switchMode(newMode)`
- Dismisses automatically after switching

The component lives at `src/features/auth/components/ModeSwitcherSheet.tsx` and is imported by both tab layouts.

---

## Data Migration

No bulk migration script. Legacy `role` field is removed lazily:

1. On login, `useAuth` fetches the user doc.
2. If `userData.role` exists, `useAuth` fires a background `updateDocument` with `{ role: deleteField() }` (Firestore `FieldValue.deleteField()` sentinel) to remove the field.
3. The field is not used to pre-set `activeMode` — all users land on the mode-select screen on their first launch of the new version.
4. Existing professional profile sub-docs (`users/{id}/profile/data`) are untouched and continue to work as-is.

---

## Files Changed

| File | Change |
|---|---|
| `src/core/types/user.ts` | Remove `UserRole`, `role` field; add `ActiveMode` |
| `src/core/stores/authStore.ts` | Replace `role`/`setRole` with `activeMode`/`setActiveMode` |
| `src/core/hooks/useAuth.ts` | Remove role loading; add legacy migration |
| `src/app/index.tsx` | Route on `activeMode` instead of `role` |
| `src/app/(auth)/mode-select.tsx` | Repurpose as recurring session picker (no Firestore write) |
| `src/features/auth/hooks/useSetRole.ts` | Delete |
| `src/features/auth/hooks/useSwitchMode.ts` | New — in-memory mode switch + navigate |
| `src/features/auth/hooks/useRegister.ts` | Remove `role: null` from user doc |
| `src/features/auth/hooks/index.ts` | Export `useSwitchMode`, remove `useSetRole` |
| `src/features/auth/components/RolePicker.tsx` → `ModePicker.tsx` | Rename file and component to `ModePicker`; repurpose logic for session entry (no Firestore write) |
| `src/features/auth/components/ModeSwitcherSheet.tsx` | New — bottom sheet for mid-session switching |
| `src/features/auth/components/index.ts` | Export `ModeSwitcherSheet` |
| `src/features/profile/hooks/useClientProfile.ts` | Add Firestore sub-doc read/write for client profile |
| `src/app/(client)/(tabs)/_layout.tsx` | Add Switch tab that opens `ModeSwitcherSheet` |
| `src/app/(professional)/(tabs)/_layout.tsx` | Add Switch tab that opens `ModeSwitcherSheet` |
| `src/features/auth/hooks/__tests__/useSetRole.test.ts` | Delete |
| `src/features/auth/hooks/__tests__/useSwitchMode.test.ts` | New — test mode switch + navigation |
| `src/features/auth/hooks/__tests__/useRegister.test.ts` | Update — no role in user doc |
| `src/features/profile/hooks/__tests__/useClientProfile.test.ts` | Update — add profile sub-doc tests |
