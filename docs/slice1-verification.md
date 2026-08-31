# Slice 1 — Emulator Verification Record

What was actually verified for the pricing/lifecycle slice, what could not be,
and the environment facts that cost time finding. Recorded so the next session
does not rediscover any of it.

State: branch work on top of `ab79735`, verified against the Firebase emulators
on 2026-09-01.

---

## Result: 65 passed / 0 failed / 0 inconclusive

Harness (scratchpad, not committed): `firebase-admin` with
`FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` for seeding and
rule-bypassing assertions, plus the `firebase` JS SDK with explicit
`connect{Firestore,Auth,Functions}Emulator` and real emulator Auth users for
anything that must be subject to rules.

Covered end to end:

- **Rules — projects.** Client cannot write `status:'completed'`, `completedAt`,
  `slotActive`, or `feeStatus`; can still write `deadline` and repost roles
  (`status → 'open'`); can still write `reviewsCompleted` on an already-completed
  project. Create allows `filledSlots: []` and rejects preset `feeStatus`,
  `slotActive`, or non-empty `filledSlots`.
- **Rules — reviews.** Create with `published` or `visibleAt` is denied; without
  them is allowed. The reviewed pro cannot read their own held review; the
  reviewer and unrelated users can; the pro can read their own *legacy*
  (field-less) and published reviews — the `.get('published', true)` default
  behaves as intended.
- **Callables.** `hireProfessional` for both an offer and a bundle through one
  enforcement path; slot cap (`slot-cap-reached`) and subscriber monthly limit
  (`monthly-limit-reached`); fee lock at chat creation; `confirmCompletion` on
  `owed` (fee computed, slot held) and on `included` (slot freed immediately);
  `markFeePaid` publishing the held review and freeing the slot, admin-only;
  `freeSlot` removing the pro from `professionalIds` / `filledSlots` / chat
  members and refusing after completion is confirmed.
- **Trigger.** `onReviewCreate` holds on an `owed` project and publishes
  immediately on an `included` one.

### Two harness traps worth remembering

Both produced *wrong* results before being caught, in opposite directions:

1. **Vacuous passes.** Assertions like "pro was removed from `professionalIds`"
   pass trivially when the setup hire silently failed and the pro was never
   added. Every removal/transition assertion now has an explicit precondition
   check and is marked inconclusive — never passing — if setup did not take.
2. **Races reported as product bugs.** Fixed `setTimeout` waits for the
   `onReviewCreate` trigger produced three failures that were pure timing. Poll
   until the field is defined; do not sleep a fixed interval.

---

## `admin.firestore.X` statics are undefined under the emulator

**Symptom.** Every write path threw `INTERNAL`:

```
TypeError: Cannot read properties of undefined (reading 'arrayUnion')
    at commitHire (functions/lib/lifecycle/hire.js:50)
```

**Cause.** Under the functions emulator (firebase-tools 15.23.0 + firebase-admin
12.7.0), `admin.firestore` is a bare function with its statics stripped:
`admin.firestore()` works — `db.batch()` succeeds — but
`admin.firestore.FieldValue` is `undefined`. Outside the emulator the same
`require` yields `[class FieldValue]`.

**Fix applied (lifecycle only).** `functions/src/lifecycle/helpers.ts` now imports
from the modular entry point:

```ts
import { FieldValue as AdminFieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
```

**Not yet fixed — its own slice.** 19 runtime call sites across 7 files use the
namespace statics; 17 across 6 files remain outside `lifecycle/`:

| File | Runtime uses | Functions affected |
|---|---|---|
| `functions/src/system/index.ts` | 6 × `FieldValue` | `sendSystemMessage`, `ensureSystemUser` |
| `functions/src/notifications/triggers.ts` | 4 × `FieldValue` | `onNewPriceOffer` (observed failing) + siblings |
| `functions/src/moderation/index.ts` | 3 × `FieldValue` | `moderateUser` |
| `functions/src/video/index.ts` | 2 × `FieldValue` | `compressVideo` |
| `functions/src/bookings/index.ts` | 1 × `FieldValue` | booking create |
| `functions/src/auth/index.ts` | 1 × `FieldValue` | user-create trigger |

Type-position uses (`admin.firestore.DocumentSnapshot`, `.WriteBatch`, `.Query`,
`.Firestore`, …) are erased at compile time and need no change — 16 such hits
across `hire.ts`, `cron.ts`, `completion.ts`, `removal.ts`, `triggers.ts`,
`system/index.ts`.

**Important caveat.** This is confirmed **emulator-only**. It has *not* been shown
to break production — `onNewPriceOffer` is long-shipped code. The modular import
is correct in both environments, so the remaining fix is safe, but do not
describe it as repairing a live outage without evidence.

---

## Gaps the emulator cannot close

- **Composite indexes are not enforced by the emulator** — a query passes locally
  whether or not its index exists. This bit once already: the slice-1 index audit
  covered only the callables, and `lifecycleCron`'s four queries went unnoticed
  until deploy time, needing three further indexes (`918c84b`). When adding any
  query, add its index by inspection; the emulator will never tell you.
  Resolved for slice 1 — see the deployment record below.
- **Rules were never validated before this run.** The Firestore emulator needs
  Java; the machine had none at commit time, which is why `ab79735` shipped
  unverified. Java is required for any local rules work.
- **No client emulator wiring.** There is no
  `connectFirestoreEmulator` / `connectAuthEmulator` / `connectFunctionsEmulator`
  anywhere in `src/`, so the app itself never points at the emulators. Local
  verification has to go through a standalone script.
- **No `@firebase/rules-unit-testing`.** Rules have no automated test suite; the
  script above is ad hoc and lives outside the repo.

---

## Deployment record — bama-af0a0, 2026-09-01

| Item | State |
|---|---|
| Firestore indexes (5 lifecycle) | **deployed, all `READY`** |
| Firestore rules | **NOT deployed — deliberately held** |
| Lifecycle functions (10) | **deployed** |
| Backfill | **run — 52/52 projects** |

**Indexes.** Two deploys, each diffed against the live project first (zero
deletions both times): the two callable indexes, then the three `lifecycleCron`
ones. Build state is *not* reported by the firebase CLI — poll the Firestore
Admin API (`.../collectionGroups/-/indexes`, field `state`) instead. They sat at
`CREATING` for 3–5 minutes before reaching `READY`.

**Functions.** Deployed by name, not `--only functions`, to avoid incidentally
shipping `moderateUser` and `sendSystemMessage` — both exist in source and have
never been deployed. Nine callables landed in us-central1; `onReviewCreate`
landed in **europe-west1**, correctly, because a v2 Firestore trigger colocates
with the database (this one is `eur3`). Cloud Scheduler was enabled by the deploy;
job `firebase-schedule-lifecycleCron-us-central1` is `ENABLED` at
`every day 03:00 (Asia/Jerusalem)`.

**Rules are the outstanding item.** They are held because the client rewire ships
in the *app bundle*: every installed build still writes `filledSlots`,
`status:'completed'`, `completedAt`, `status:'cancelled'` and `cancelledAt`
directly, and the new rules deny all of it. Deploying rules before an app release
breaks hire, complete, cancel and remove for every existing user, and a functions
deploy does not rescue them — the old binary never calls the callables. **Deploy
rules with, or just after, the app release carrying `ab79735`.** Until then the
security holes in §2/§3 of that commit remain open in production.

**Backfill** (`scripts/backfill-lifecycle.mjs`, run `--commit`): scanned 52,
touched 52 — `feeStatus:'exempt'`, `slotActive:false`, `professionalIds` derived
from `filledSlots`. Independently read back: 52/52 carry all three, `slotActive`
is `true` on none, and `professionalIds` matches `filledSlots` on every doc with
zero mismatches. Re-running the dry run reports 52 skipped / 0 to touch, so it is
confirmed idempotent.

Deliberate policy call: the 22 **in-flight** legacy projects (not
completed/cancelled, with a hired pro) also got `slotActive:false`, so they do not
occupy slots. The cap is therefore unenforced for pre-launch work until those
projects turn over. Chosen over `slotActive:true` because nothing routes legacy
projects through `confirmCompletion`/`markFeePaid`, so a `true` would strand
those slots permanently.

## Project ID: `bama-af0a0`

`.firebaserc` previously declared `bama-dev` / `bama-staging` / `bama-prod`.
Those names trace verbatim to `docs/superpowers/plans/2026-05-23-bama-scaffold.md`
(lines 351-353) — scaffold placeholders never updated to the real project. The
actual project, per `.env` and all three `eas.json` build profiles, is
**`bama-af0a0`**.

`.firebaserc` now declares only `default: bama-af0a0`. The `staging` and
`production` aliases were **removed rather than renamed**: they pointed at
unverified names, and a `--project production` that resolves to a nonexistent or
foreign project is worse than one that fails fast with "alias not found". If real
staging/production projects exist, add them back with their true IDs.

This matters for the pending backfill: a `firebase deploy` or backfill run
without an explicit `--project` used to resolve to `bama-dev`.

---

## Functions region: us-central1, leave it

`src/core/firebase/config.ts` calls `getFunctions(app)` with no region, which the
JS SDK defaults to **us-central1**. Every callable in the repo declares no region
and therefore lives there. `compressVideo` is the lone `europe-west1` function
and is a **Storage trigger** — invoked by the bucket, never through
`getFunctions()` — so it is not evidence of a project-wide region.

Confirmed against the emulator:

```
POST /bama-af0a0/us-central1/hireProfessional  -> 401  (exists)
POST /bama-af0a0/europe-west1/hireProfessional -> 404  (absent)
```

Moving the lifecycle functions to `europe-west1` would break them. A genuine
region migration is a coordinated change on both sides — `setGlobalOptions` in
functions *and* `getFunctions(app, 'europe-west1')` in `config.ts` — affecting all
five pre-existing callables.
