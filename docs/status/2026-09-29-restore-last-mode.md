# Restore last active mode on launch (2026-09-29)

**Status:** committed at the user's request. The web and iPhone checks (a)–(f) below have not been run.

## Automated checks
- `npx jest`: 262 suites, 2317 tests, all pass.
- `npx tsc --noEmit`: clean.
- ESLint on the changed and new files: 0 errors.
  - The whole repo still has errors, but none come from this change.
  - The 5 errors in `src/app/(client)/(tabs)/_layout.tsx` are in the uncommitted chat-search / nav-debug work, which this change doesn't touch.

## Web checks: NOT RUN
- The Chrome extension wasn't connected.
- Signing in means typing account passwords that go to Firebase, which I can't do.
- Please run the steps below yourself on localhost:8081, or sign in with the extension connected and I'll drive the rest.

## What changed

### New files
- `src/core/storage/lastMode.ts`
  - Provides `readLastMode` / `writeLastMode` / `clearLastMode`, keyed `bama:lastMode:{uid}`.
  - Uses AsyncStorage, which is backed by localStorage on web.
  - Never throws. An unknown value reads as null, which means mode-select.
- `src/core/stores/launchIntentStore.ts`
  - Holds `{ checked, hasPending }`: whether the app was launched by tapping a notification.
  - On web it starts as checked.
- `src/features/auth/hooks/useAdoptGroupMode.ts`
  - The group layouts wait while `isLoading`.
  - If the user is signed in with no mode, the group sets its own mode and saves it.

### `src/core/hooks/useAuth.ts`
- Restores the saved mode after `setUser`, before `setLoading(false)`. The root keeps its spinner until then, so there's no mode-select flash.
- **Professional:** reads `profile/data` with a 3 s timeout.
  - On success, it sets `proProfileCompleted`.
  - On failure or timeout, it leaves it null and continues.
- **Stale-uid guard:** it only applies the saved mode if `user.id === uid` after each await.
- **Sign-out branch:** clears the key for the previous uid. That covers logout, account deletion, a declined consent and suspension.

### Routing
- `nextAuthRoute.ts`
  - Client now goes to `/(client)/(tabs)/home` (it used to go to `/browse`).
  - A pro with `proProfileCompleted === false` goes to `/(professional)/(tabs)/profile`. Otherwise pros go to `/dashboard`.
  - The consent, email and setup checks are unchanged and still come first.
- `src/app/index.tsx`
  - Waits for `launch.checked`.
  - Passes `proProfileCompleted` to `nextAuthRoute`.
  - Renders nothing (no redirect) while a launch tap is pending and the user has a mode and no gate is due.

### Mode switching and logout
- `useSwitchMode.ts`
  - Saves the key on every switch.
  - New option `switchMode(mode, { navigate: false })` sets and saves the mode without navigating.
- `useLogout.ts`: captures the uid before `signOut()` and clears the key after it.

### `useNotificationRouting.ts`
- Uses the synchronous `getLastNotificationResponse()`.
  - In expo-notifications 57, the deprecated async version only wraps the synchronous one, so it can't hang and a 2 s timeout has nothing to wait on.
  - If the call throws, it records "checked, nothing pending".
- Waits for the consent, email and setup gates before routing a tap.
- **Launch tap:** a single `router.replace(target)`. If the tap needs the other mode, it first calls `switchMode(target, { navigate: false })`. That fixes the old race where a pro's delayed replace overwrote the push.
- **Tap while the app is open:** a same-mode tap pushes. A tap that switches mode replaces.
- After handling a launch tap it calls `clearLastNotificationResponse()`, so a later cold start doesn't reopen the same old notification.

### Layouts
`(client)/_layout.tsx` and `(professional)/_layout.tsx` now call `useAdoptGroupMode`.

### Old `/browse` route
Nothing in the app depended on `nextAuthRoute` returning `/(client)/(tabs)/browse`. Only two tests asserted it (`authStepRouting`, `consentGate`), and both now expect `/home`.

### Tests
- **New files:**
  - `lastMode.test.ts`
  - `useAuthRestoreMode.test.ts`
  - `indexLaunchIntent.test.tsx`
  - `useNotificationRouting.test.ts`
  - `groupLayoutsMode.test.tsx`
- **Extended:** `useSwitchMode` and `useLogout` tests.
- **Adjusted:**
  - Added the async-storage mock where authStore consumers now import `lastMode`.
  - Set `isLoading: false` or `launch checked` in the root and layout tests.

### Known limitations
- **Existing users see mode-select once after this ships.** No key has been written for them yet. From then on the mode is remembered.
- **Cold-start tap with no saved mode.** A notification tap that cold-starts the app for a user with no saved key still goes through mode-select first. That path is unchanged, and the old pro-mode race still applies there.

## Web steps (localhost:8081)
DevTools → Application → Local Storage shows the `bama:lastMode:<uid>` key.

- **a)** Sign in → pick **Client** → reload. You should land on client **home**, with no mode-select flash.
- **b)** Switch to **Professional** (completed profile) → reload. You should land on the **noticeboard** (`/dashboard`).
- **c)** Switch back to Client → reload → home. Switch to Pro → reload → noticeboard.
- **d)** Sign out. The key for that uid should be gone. Sign in as a different user → **mode-select**.
- **e)** Use a new account (or one whose `profile/data.proProfileCompleted` is false). Pick Professional → reload → the forced **profile** screen, with the tab bar hidden.

## iPhone steps
The app needs to be rebuilt or reloaded with this code. "Kill" means swipe the app away in the app switcher, then open it from the icon.

- **a)** Pick **Client** → kill → open. You should land on client home, with no mode-select in between.
- **b)** Switch to **Professional** (completed profile) → kill → open. You should land on the noticeboard.
- **c)** From pro, switch to client using the header mode switcher → kill → open. You should land on client home. Then do the reverse.
- **d)** Sign out → sign in as a different account → mode-select. Kill and reopen without picking a mode: still mode-select.
- **e)** A new account → pick Professional (profile not finished) → kill → open. You should land on the forced edit-profile screen, and not be able to leave it.
- **f)** Push notification tap:
  1. Save **Client** mode on the phone, then kill the app.
  2. From a second account, send a chat message to this user.
  3. Tap the notification. You should land directly in that chat, not on home.
  4. Back should go to the chats list or home, not mode-select.
  5. Variant: save **Client** mode and send a notification that opens in pro mode (e.g. a marketplace `purchase`, or `offer_accepted` to a pro). Kill the app and tap it. You should open straight on the pro target, and the tabs should be pro tabs.
  6. Kill and reopen normally (no tap). You should land on the mode's home, **not** that old notification's target again.
