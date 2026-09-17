# Status, 2026-09-16

Plain-text status. Per-topic reports live in `docs/status/`; this file is the
current top-level picture. Two threads this session: the portfolio media viewer,
and a duplicate-chat bug in hiring.

---

## STATE

**2026-09-17 — V1 candidate review card: merged, pushed, DEPLOYED, verified live on web.**
Rules (`981106c2…`) and 43 functions from `0152f73`, verified from downloaded artefacts.
Live web click-through of both flows passed. **iPhone pass not done — needs you.**
Report: `docs/status/2026-09-17-v1-deploy.md`. Next deferred commit: sole-pro withdrawal
fix (drop withdrawn engagements from completion only when nothing ever completed).


**Shipped to origin/main**
- `ddf1e4a` — portfolio viewer became a vertical pager; per-item captions.
- `37aff51` — Reels-style chrome, page-background backdrop, two close-button fixes.

**Written, pushed, NOT deployed**
- Nothing. Both commits are client-only and ship with the next app build.

**Deployed to production (2026-09-16 19:17 UTC)** — `hireProfessional` only, revision
`hireprofessional-00009-ceq`, from `ef8e0c3`. Carries both hire fixes: the
duplicate-chat transaction (`0ec90eb`, §2) and the slot-cap race (R8, §2b). Deployed
source downloaded and diffed byte-identical; recorded in `docs/production-deploys.md`.
No other function was redeployed.

**Gate at time of writing:** 703 tests / 71 suites green; root and `functions/`
both typecheck clean.

---

## 1. Portfolio media viewer — done

### Vertical pager (`ddf1e4a`)
Was already a horizontal pager; turned it vertical, Instagram-style.
- `getItemLayout` measures height, not width — the thing that silently breaks a
  vertical pager if missed.
- Slide size moved from a module-level `Dimensions.get()` to
  `useWindowDimensions()`, so pages stay aligned across rotation and resize.
- **Swipe-down-to-dismiss removed from video slides.** On a vertical pager that
  gesture and "page to the previous item" are the same motion; they raced. Paging
  won. This has a consequence — see OPEN #3.
- Viewability threshold 50 → 80, so a video being swiped past no longer starts
  playing before the page settles.

### Captions (`ddf1e4a`)
- `MediaAsset` gained `caption: string | null`, capped at 200 chars.
- Picking media now opens a caption sheet **before** the upload starts. Save
  stores the text, Skip stores null and uploads anyway.
- Whitespace-only captions normalise to null, so no empty band renders.
- Shown only on the full-screen slide, never on the grid.
- Chat media sets `caption: null` — it is a portfolio-only idea.
- Assets predating the field read as `undefined`, which the viewer treats as no
  caption. **Firestore rules needed no change**: the `portfolio/{assetId}` rule is
  owner-scoped with no field whitelist.

### Chrome redesign (`37aff51`)
- Top bar is a real flex row (56px, space-between) anchored to the safe area;
  counter leading, close trailing. Direction is driven by the language store —
  `I18nManager.allowRTL(false)` app-wide means rows never flip on their own.
- Counter is a 13px pill, close a 32px circle, both on their own dark ground so
  they read over the page background *and* over a dark photo.
- Caption band is a bottom-up gradient, not a flat panel: a flat wash vanishes on
  a dark image and cannot carry white text on a bright one. Clamped to 3 lines.
- Label above the caption reads "Information" / "מידע" for both media types, with
  an `Info` icon. (Was "Photo"/"Video"; the type icon went with it.)
- Media stays full-bleed. No dot row — the counter carries position.
- Backdrop is `colors.bgGradient`, the same token `Screen` gives every page, so
  the lightbox sits on the profile's own background. Slides are transparent so it
  shows through the letterbox bars.

### Two close-button defects, both fixed (`37aff51`)
- **Web:** an absolutely-positioned button resolved against RNGH's zero-height
  web wrapper and landed at `y:707` in a `679px` viewport. The viewer could not be
  dismissed at all on web. Normal-flow children in the top bar fix it.
- **iOS:** `useSafeAreaInsets()` reports **zeros inside a `Modal`** — the modal is
  presented outside the SafeAreaProvider. A bare `insets.top` put the X under the
  notch. `useModalInsets()` now prefers `initialWindowMetrics` (captured natively
  at startup, correct inside a modal) and floors at 44/20 as a last resort.
  Reported from the device; this is the one that left users trapped.
- `hitSlop` trimmed to the slack actually inside the bar — touches beyond a
  parent's bounds are dropped, so the excess was a silent no-op.

---

## 2. Duplicate project chats — fixed, committed (`0ec90eb`), DEPLOYED 2026-09-16

**Reported:** one professional with two offers on one project produced two project
chats.

**Root cause.** `functions/src/lifecycle/hire.ts` — `commitHire` decided
`isFirstHire = !project.chatId` from a snapshot read *before* the write, then
committed through `db.batch()`. A batch is atomic but **not isolated**: it never
re-reads. Two overlapping `hireProfessional` calls both saw `chatId` absent, each
created a chat, and the later `projUpdate.chatId` won. The losing chat kept the
client in `members`, so it stayed in their chat list and nothing errored.

**Why two offers made it reachable.** `projects/index.tsx` passed
`isAccepting={isAccepting === item.data.id}`, so only the tapped card disabled.
Two offers render two live Accept buttons and the second tap lands mid-call. The
file already documented this race class for `filledSlots` and judged it
unreachable because "hires are client-initiated, one at a time" — the UI never
enforced *one at a time*.

**Fix, two layers.**
- Server: `commitHire` commits inside `db.runTransaction`, re-reading the project
  as `fresh`. Firestore retries on contention, so the second hire sees the first
  one's chat. Follows the existing idiom in `completion.ts:460`. Two things fell
  out: the `filledSlots` append race is closed too, and `endDate` no longer reads
  the stale copy.
- Client: both offer cards take `busy`; the screen passes `anyHireInFlight`. One
  accept locks Accept everywhere, bundles included; only the tapped card spins.

**Tests.** `hireAtomicity.test.ts` follows the `oneWriter.test.ts` precedent — a
build-enforced structural invariant, because this failure is silent and invisible
at the chat write itself. Four mutations killed, including restoring the exact
original line.

---

## 2b. Slot-cap race (R8) — fixed (`ef8e0c3`), DEPLOYED 2026-09-16

Two concurrent hires of one professional onto two different projects both passed
the cap check, which ran before the transaction. `commitHire` now re-runs the cap
query through `tx.get(query)` before any write. Emulator: old code over the cap
20/20 (tx shape) and 10/10 (callables); fixed 0/20 and 0/10. Production: 5/5 rounds
one hire landed and one was refused, zero residue. Full record:
`docs/status/2026-09-17-r8-slot-cap-race.md`.

---

## OPEN

1. ~~**Deploy the hire fix.**~~ **CLOSED 2026-09-16.** `hireProfessional` deployed
   with the duplicate-chat fix and the R8 slot-cap fix (§2, §2b). The client half
   (Accept locks on every card while a hire is in flight) still ships with the next
   app build.

2. **Existing duplicate chats are not cleaned up.** Projects already carrying an
   orphaned chat still show it. Offered: a read-only script listing chats whose
   `projectId` points at a project whose `chatId` is a *different* document —
   to be eyeballed before anything is deleted, since some may hold real messages.

3. **Videos exit only via the X.** Photos have tap-to-close; videos lost
   swipe-down-to-dismiss when paging went vertical. Two candidate second exits:
   tap-anywhere (expo-video's native controls will eat taps near the scrubber) or
   dismiss-on-overscroll at the first item. Not started — adding a gesture here is
   what re-breaks paging, and it cannot be tested from this machine.

4. **iPhone verification outstanding.** The notch fix was verified on web, where
   insets behave differently from the iOS modal case that actually broke. Also
   unverified on device: a long caption's 3-line clamp (only proved via a DOM
   probe on web), the video caption clearing the scrubber, a 1-item portfolio, and
   rotation while the viewer is open.

5. **Upload flow never run against a real file.** The web picker is an OS dialog
   that would freeze the automation session, so the caption sheet, Save, Skip and
   the video path are covered by tests only. No caption has rendered over real
   media either — that needs one in Firestore.

6. **Unexplained:** during web testing the viewer closed itself twice while
   scrolling between items. Not reproducible deliberately; the close button, back
   and tap paths all behave correctly when tested directly. Watch for it on device.

7. **ESLint got installed as a side effect.** `npx expo lint` found ESLint was
   never a dependency (so `npm run lint` was a dead script), installed
   `eslint` + `eslint-config-expo` and scaffolded `eslint.config.js`. Uncommitted.
   Decide: commit separately, or revert.

8. **`src/app/(professional)/(tabs)/_layout.tsx` is modified and not ours.** It
   predates this session. Reorders imports, removes the `profileEditing`
   tab-bar-hiding behaviour, and mangles one line into
   `export default function ProfessionalTabsLayout() {   const [totalUnread, ...`.
   Looks half-finished. Deliberately left out of both commits.

9. **`AGENTS.md` pins Expo docs to v56**, but `package.json` has `expo ~57.0.9`.
   The `expo-video` surface in use is identical between them, so nothing turned on
   it — but the pin is stale.

10. **Caption band treatment is still dark** on a now-light backdrop. Legible over
    both the page gradient and photos, and the smaller change. A light band would
    need its own answer for sitting over dark photos.

11. The Expo web dev server was killed by the OS for low memory; `localhost:8081`
    is down. Restartable, nothing lost.

12. **Step 2 shows its validation error off-screen.** `errors.slots` renders at
    the top of the roles card (`src/app/(client)/(tabs)/home/index.tsx:425`), but
    step 1→2 arrives via `scrollToEnd()` (`:163`) — so a user who lands at the
    bottom and presses Next with no roles chosen gets an error message rendered
    above the fold, and the press reads as doing nothing at all. Design defect,
    not a regression; predates the press-feedback work. To be fixed in the
    step-transition round with scroll-to-first-error, which is also where a
    Warning haptic on the failure branch belongs.

13. **`2faf44c` shipped a step transition that stranded on web, and the tests
    could not see it.** `goToStep` put the content swap inside the `withSpring`
    completion callback. Reanimated 4 never invokes that callback on web
    (confirmed by probe: the callback log never fired — it was not a cancellation
    reporting `finished: false`, it simply never ran), so the builder faded out,
    slid, and stayed on step 1 forever. The screen was unusable past step 1 for
    every web user.

    **The lesson is the test, not the bug.** The reanimated mock did
    `withSpring: (v, _cfg, cb) => { cb?.(true); return v; }` — firing the
    callback synchronously and always with `true`. Eight transition tests passed
    against behaviour no real platform exhibits. The mock was asserting itself.

    Fixed by removing the dependency rather than adding a fallback: the step now
    changes synchronously with the press and the animation is decorative, so no
    animation outcome can gate content. Opacity is no longer animated at all —
    a value stranded at 0 is an unusable screen, whereas `translateX` stranded at
    40 is content that is merely off-centre. The failure mode has to stay
    survivable.

    **The mock now defaults to `'never'` calls back**, matching web, and can be
    switched to `'finished'` or `'cancelled'` per test. Reintroducing the
    original structure now fails 8 tests. Never verified on iPhone — the callback
    may well fire there, and the fix is platform-independent either way.
