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

- **Composite indexes are not enforced by the emulator.** The slot-cap query
  (`projects` where `professionalIds array-contains` + `slotActive ==`) passed
  here regardless of whether its index exists. Both indexes added in `ab79735` —
  that one and `reviews` (`projectId` + `published`, used by
  `publishProjectReview`) — are **only** validated by a real deploy. Treat them
  as unverified until `firebase deploy --only firestore:indexes` succeeds and the
  cap query runs against the deployed project.
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
