# Client home screen — press feedback and step transitions, 2026-09-16

STATE: rounds 1-3 complete in the working tree, uncommitted except docs/STATUS.md.
Nothing from rounds 2 or 3 has been seen running in a browser or on a device.

---

## 1. The hire fix (asked four times; answers kept getting truncated)

**Not part of this design pass.** Pre-existing uncommitted work in the tree,
untouched by me.

**What it is.** A duplicate-project-chat bugfix. One professional with two offers
on one project produced two separate project chats.

**Root cause.** `functions/src/lifecycle/hire.ts` — `commitHire` decided
`isFirstHire = !project.chatId` from a snapshot read *before* the write, then
committed through `db.batch()`. A batch is atomic but **not isolated**: it never
re-reads. Two overlapping `hireProfessional` calls both saw `chatId` absent, each
created a chat, and the later `projUpdate.chatId` won. The losing chat kept the
client in `members`, so it stayed in their chat list and nothing errored.

**Why two offers made it reachable.** `projects/index.tsx` passed
`isAccepting={isAccepting === item.data.id}`, so only the tapped card disabled.
Two offers render two live Accept buttons and the second tap lands mid-call.

**The fix, two layers.**
- Server: the commit moved into `db.runTransaction`, re-reading the project as
  `fresh`; Firestore retries on contention so the second hire sees the first
  one's chat. A structural `Writer` type was introduced so the existing per-type
  `acceptWrites` closures work against either a WriteBatch or a Transaction
  unchanged. `project` is deliberately no longer destructured inside the commit,
  so every read comes from `fresh` — which also closes the `filledSlots` append
  race and a stale `endDate` read.
- Client: both offer cards take a `busy` prop; the screen passes
  `anyHireInFlight`. One accept locks Accept on every card, bundles included;
  only the tapped card spins.

**Files.**

| File | Change |
| --- | --- |
| `functions/src/lifecycle/hire.ts` | ~96 lines — the substance |
| `src/app/(client)/(tabs)/projects/index.tsx` | +6 |
| `src/features/offers/components/PriceOfferCard.tsx` | +12 |
| `src/features/offers/components/BundleOfferCard.tsx` | +12 |
| `functions/src/lifecycle/__tests__/hireAtomicity.test.ts` | new, untracked |
| `src/features/offers/components/__tests__/PriceOfferCardBusy.test.tsx` | new, untracked |

**Does it look finished?** Yes, as code. Both test files are among the 77 suites
currently passing, tsc is clean, and `docs/STATUS.md` records four killed
mutations. What is outstanding is not code: `firebase deploy --only functions`
(STATUS.md open item 1) and the orphaned-chat cleanup (item 2). Left untouched
and uncommitted, as instructed.

---

## 2. Verification — current state

- `npx tsc --noEmit` — **clean**.
- `npx jest` — **77 suites, 753 tests, all passing**. Baseline at the start of
  this work was 74 suites / 694 tests.
- `grep -c setTimeout` on the home screen — **2 hits, both inside comments**
  explaining what they replaced. Zero live timers.
- `MiniCalendar`'s three pre-existing suites still pass untouched — the proof
  that nothing drifted outside the brief.

**NOT verified.** Round 1's role tile is the only thing confirmed in a browser.
Rounds 2 and 3 have never been pressed by anyone:

- **Web** — needs the Metro dev server. Round 3 added no dependency, so fast
  refresh should carry it, but nothing has been exercised.
- **iPhone** — `ExpoHaptics` is absent from `ios/Podfile.lock`, so the installed
  dev client has no haptics native module. `requireOptionalNativeModule` returns
  null rather than throwing, and the wrapper's `.catch(() => {})` swallows the
  rejection: no crash, scale works, haptic silently absent until
  `npx expo run:ios`.
- Spring feel and the 40pt slide distance are judgments no passing test can make.

---

## 3. Mutation summary — 15 run, 15 killed, 2 needed new tests

**Round 1 — 4 run, 1 survived.**

| Mutation | Result |
| --- | --- |
| press-in never shrinks | killed |
| haptic fires on press-down instead of release | killed |
| web gate removed from haptics | killed |
| **tile buzzes even when inert** | **SURVIVED** → 2 tests added → killed |

**Round 2 — 5 run, all killed first pass.**

| Mutation | Result |
| --- | --- |
| date-square opener buzzes (opening treated as a commit) | killed |
| clear badge loses its haptic | killed |
| **commitFeedback moved BEFORE the validation guard** | killed |
| **step-2 guard buzzes before bailing** | killed |
| pill uses `commit` instead of `tap` | killed |

The two bolded ones are the payoff: they are exactly what would have shipped had
the haptic gone on the `PressableScale` prop instead of inside the handler.

**Round 3 — 6 run, 1 survived; then 4 more after new tests.**

| Mutation | Result |
| --- | --- |
| RTL mirror dropped (direction stops flipping for Hebrew) | killed |
| reduce-motion ignored (always slides) | killed |
| warnFeedback dropped from step 1 failure | killed |
| warnFeedback dropped from step 2 failure | killed |
| swap never happens (renderedStep frozen) | killed — 15 tests failed |
| **scrollToEnd one-shot never armed** | **SURVIVED** |

The survivor revealed that nothing covered the scroll behaviour at all. That
prompted `stepScroll.test.tsx` (7 tests), after which:

| Mutation | Result |
| --- | --- |
| scrollToEnd one-shot never armed (re-run) | killed |
| one-shot never disarms (fires on every layout pass) | killed |
| step-3 swap forgets to reset scroll | killed |
| scrollToFirstError dropped from step 1 failure | killed |
| step 2 failure does not scroll to the error | killed |

---

## 4. Files in this design pass

| File | State |
| --- | --- |
| `docs/STATUS.md` | **committed** — c32bb61, 176 insertions, main |
| `package.json` / `package-lock.json` | modified — `expo-haptics ~57.0.3` |
| `src/core/haptics.ts` | new, 45 lines — tap / commit / warn, web-gated |
| `src/components/ui/PressableScale.tsx` | new, 77 lines |
| `src/app/(client)/(tabs)/home/index.tsx` | modified, +193 / −52 over three rounds |
| `src/core/__tests__/haptics.test.ts` | new — 10 tests |
| `src/components/ui/__tests__/PressableScale.test.tsx` | new — 9 tests |
| `.../home/__tests__/roleTiles.test.tsx` | new — 9 tests |
| `.../home/__tests__/builderPressFeedback.test.tsx` | new — 7 tests |
| `.../home/__tests__/stepTransitions.test.tsx` | new — 8 tests |
| `.../home/__tests__/stepScroll.test.tsx` | new — 7 tests |

Untouched throughout: `MiniCalendar.tsx`, `AppHeader.tsx`, `floatingTabBar.ts`,
`SlidingTabBackground.tsx`, `PageTitle.tsx`, `Screen.tsx`, `AppText.tsx`, the
tabs layout, and every Firestore query, Cloud Function, security rule and type.

ROLLBACK: `git checkout -- src/app/(client)/(tabs)/home/index.tsx` and delete
`src/core/haptics.ts`, `src/components/ui/PressableScale.tsx` and the five new
test files; `npm uninstall expo-haptics`. docs/STATUS.md is committed separately
and can stay.

---

## 5. Next, not started

Typography — group (d). Size-specific leading, and negative tracking gated to the
English branch only via the existing `HEBREW_RE` in `useAppFont`, because Heebo
does not tolerate tracking the way Montserrat does. `PageTitle.tsx` is shared by
every tab page and will NOT be edited; the overrides go through the `style` prop
it already accepts. Before/after screenshots in both languages first.

---

## 6. Typography (group d) — applied, verified in both languages

**Tracking: display title only, English only.** `PageTitle` at 26pt gets
`letterSpacing: -0.5` in English and **0 in Hebrew**, passed through the `style`
prop so shared `PageTitle.tsx` is not edited. Latin display type reads too loose
as it grows; Heebo does not tolerate tracking — its letters carry their own
spacing and pulling them together cramps the joins. The title's
`textTransform: 'uppercase'` is a no-op in Hebrew anyway, so tracking tuned for
Latin caps would not correspond to anything there.

Verified on web at 26pt in both languages: English visibly tightened, **Hebrew
glyphs identical** — same letterforms, same spacing, only the block sits tighter
from the leading change.

**Leading: size-specific, both scripts.** Tighter as type grows, looser as it
shrinks. Title 30/26 (≈1.15). Then 16→21, 14→18, 13→17/18, 12→16, 11→14 across
`stepLabel`, `label`, `error`, `submitText`, the location picker rows, the
step-3 role/pill/footer text and the date-square text.

**Deliberately not touched:**
- The single-line `input` style gets no `lineHeight` — on a TextInput it fights
  RN's own vertical centring. The multiline description already sets 21 inline
  at its own 15pt.
- Body and small-text **tracking stays at 0 in both scripts.** The skill wants a
  slight positive bump on small text, but Heebo tolerates tracking poorly in
  either direction, and a per-string Hebrew gate on a dozen small labels buys
  little for the risk.
- `PageTitle.tsx`, `AppText.tsx`, `useAppFont.ts` — all shared, all untouched.

Gate after the change: tsc clean, 77 suites / 753 tests.

**Screenshots** (before → after, both languages) are in
`/var/folders/h7/9940d3pn4zq5k6j2w54h3jnm0000gn/T/claude-chrome-screenshots-DVYGHQ/`
— a temp directory, so copy them out if they need keeping.

---

## 7. End of the design pass

Groups (a) response, (b) springs, (c) spatial consistency and (d) typography are
done. Group (e) materials was findings-only by instruction — the opaque
`AppHeader`, the web-only tab-bar blur and the instant-snap settings panel are
described in section 5 of the plan and remain untouched.

Still uncommitted: everything except `docs/STATUS.md` (c32bb61). Still unbuilt
for iPhone: `npx expo run:ios` is needed before any haptic fires on device.
