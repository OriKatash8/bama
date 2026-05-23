# BAMA — Codebase Structure Design

**Date:** 2026-05-23
**Stack:** React Native · Expo · TypeScript · Expo Router · Zustand · Firebase (full suite)

---

## Overview

BAMA is a marketplace platform where clients discover and hire media professionals (photographers, editors, producers, etc.) and assemble full production crews for creative projects. The app is role-based: a user is either a **client** or a **professional**.

The codebase is structured as a single Expo app today, with the business logic layer intentionally isolated so a future web client (for clients only) can reuse it without rewriting.

---

## Architecture

Option A — Feature-based with shared core.

All Firebase calls, Zustand stores, shared types, and data hooks live in `src/core/` — a UI-free layer with no React Native imports. Feature modules in `src/features/` consume `core/` but never call Firebase directly. Expo Router `app/` files are thin route shells that import from features.

This separation means migrating to a monorepo for web sharing is a lift-and-shift of `core/`, not a rewrite.

---

## Top-Level Structure

```
bama/
  app/                  # Expo Router — routes only, no logic
  src/
    core/               # UI-free business logic (future web-sharable)
    features/           # Self-contained feature modules
    components/         # Shared UI primitives
    utils/              # Pure helpers (formatters, validators, constants)
  assets/               # Images, fonts, icons
  functions/            # Firebase Cloud Functions (Node.js, separate project)
  docs/                 # Specs and design docs
  .env                  # Local env vars (gitignored)
  app.json              # Expo config
  tsconfig.json         # Path aliases: @core, @features, @components, @utils
  firebase.json         # Firebase project config (rules + emulator config)
  .firebaserc           # Firebase project aliases
```

---

## src/core/

UI-free layer. No React Native imports. Safe to share with a future web client.

```
src/core/
  firebase/
    config.ts           # Firebase app init (Auth, Firestore, Storage, RTDB, Functions)
    auth.ts             # Auth helpers: signIn, signUp, signOut, onAuthChange
    firestore.ts        # Typed Firestore read/write helpers
    storage.ts          # File upload/download helpers
    functions.ts        # Callable Cloud Functions wrappers
    rtdb.ts             # Realtime Database helpers (chat, live presence)
  stores/
    authStore.ts        # Current user, role (client | professional), session state
    uiStore.ts          # Global UI state (loading, modals, toasts)
  types/
    user.ts             # User, ClientProfile, ProfessionalProfile
    project.ts          # Project, CrewSlot, Booking
    media.ts            # Role enum, Portfolio, MediaAsset
    common.ts           # Shared primitives (ID, Timestamp, ApiError, etc.)
  hooks/
    useAuth.ts          # Auth state + helpers
    useFirestore.ts     # Generic typed Firestore hook
    useStorage.ts       # Upload progress + resolved URL hook
```

**Rule:** `firebase/` files export typed functions, never classes. Zustand stores are the only consumers of firebase helpers — features and components never call the Firebase SDK directly.

---

## src/features/

Each feature is self-contained: its own components, hooks, and local utils. Features communicate through `core/stores/` only — no feature imports another feature's internals.

```
src/features/
  auth/
    components/         # LoginForm, RegisterForm, RoleSelector
    hooks/              # useLogin, useRegister
    utils/              # Validation helpers
  marketplace/
    components/         # ProfessionalCard, RoleFilter, SearchBar
    hooks/              # useProfessionals, useFilterByRole
    utils/
  crew/
    components/         # CrewBuilder, CrewSlot, TeamSummary
    hooks/              # useCrew, useProject
    utils/
  bookings/
    components/         # BookingCard, BookingStatus
    hooks/              # useBookings, useBookingActions
    utils/
  profile/
    components/         # ProfileHeader, PortfolioGrid, EditForm
    hooks/              # useProfile, usePortfolio
    utils/
  notifications/
    components/         # NotificationItem, NotificationBadge
    hooks/              # useNotifications
    utils/
```

---

## app/ — Expo Router Routes

Route groups separate auth and role-based navigation. No business logic lives here.

```
app/
  _layout.tsx             # Root layout — font loading, auth gate, global providers
  index.tsx               # Redirects to (auth) or (client)/(professional) based on authStore
  (auth)/
    _layout.tsx           # Auth stack layout (no tab bar)
  (client)/
    _layout.tsx           # Client tab layout
    (tabs)/
      browse/             # Discover professionals by role
      crew/               # Build and manage project crews
      bookings/           # Active and past bookings
      profile/            # Client profile
  (professional)/
    _layout.tsx           # Professional tab layout
    (tabs)/
      dashboard/          # Incoming booking requests
      portfolio/          # Manage work samples
      bookings/           # Active and past bookings
      profile/            # Professional profile
```

---

## src/components/

Shared UI primitives with no feature-specific logic.

```
src/components/
  ui/
    Button.tsx
    Input.tsx
    Avatar.tsx
    Badge.tsx
    Card.tsx
    Modal.tsx
    Toast.tsx
  layout/
    Screen.tsx            # Base screen wrapper (safe area, keyboard, scroll)
    Header.tsx
    TabBar.tsx
```

---

## src/utils/

Pure functions, no side effects, no Firebase.

```
src/utils/
  formatters.ts           # Date, currency, duration formatting
  validators.ts           # Input validation (email, phone, URL)
  constants.ts            # App-wide constants: roles, booking statuses, limits
```

---

## functions/

Co-located Firebase Cloud Functions. Separate Node.js project with its own `package.json` and `tsconfig.json`.

```
functions/
  src/
    auth/                 # onUserCreate trigger — writes role to Firestore
    bookings/             # onCreate/onUpdate triggers — status transitions, notifications
    notifications/        # Push notification senders (FCM)
    payments/             # Payment processing (future)
  package.json
  tsconfig.json
```

---

## Key Config Files

| File | Purpose |
|---|---|
| `app.json` | Expo app config: name, scheme, bundle ID, plugins |
| `tsconfig.json` | Path aliases: `@core/*`, `@features/*`, `@components/*`, `@utils/*` |
| `firebase.json` | Firestore/Storage/Functions/RTDB rules paths + emulator ports |
| `.firebaserc` | Project aliases (dev, staging, prod) |
| `.env` | `EXPO_PUBLIC_FIREBASE_*` keys (gitignored) |

---

## Data Flow

```
Expo Router screen
  → imports from src/features/<feature>/hooks/
    → reads/writes src/core/stores/ (Zustand)
      → stores call src/core/firebase/ helpers
        → Firebase SDK
```

Components never touch Firebase. Stores are the single source of truth. Features own their UI and local logic; `core/` owns all persistence.

---

## Future Web Client

When the client-facing website is built:

1. Extract `src/core/` into a shared package (`packages/core/`)
2. Create `apps/web/` (Next.js or Remix) that imports from `@bama/core`
3. Mobile app imports from the same package — zero logic duplication

The `(professional)/` routes stay mobile-only; the web app covers `(client)/` flows only.
