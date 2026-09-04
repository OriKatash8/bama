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

---

# Per-professional fee correction — verification record

Run 2026-09-02 against the emulators, on `fix/per-professional-fees`. Java 26 is
now installed, so unlike the original slice-1 run the **rules were verified
locally** rather than shipped unverified.

## Result: 60 passed / 0 failed / 0 inconclusive

Two harnesses (scratchpad, not committed), because they answer different questions:

**33 assertions — fee algebra and document shapes.** Mirrors the settlement logic
against real Firestore reads/writes. Covers the per-pro split, bundle
deduplication, independent settlement, the §5 top-up, and the legacy fallback.
This validates the arithmetic, *not* the shipped callables — see below.

**27 assertions — the REAL callables and the REAL rules.** Admin SDK seeds and
asserts (bypassing rules); the `firebase` JS SDK with real emulator Auth users
exercises everything that must be subject to rules, against
`connect{Firestore,Auth,Functions}Emulator`.

### What the second harness proved

- **Rules.** A pro reads their own fee doc and **not** another pro's; the
  **client cannot read any fee doc** (§6 — the client is never told a pro owes
  money); no client can write a fee doc or edit `slotHolders`. An **accepted**
  offer's price cannot be rewritten by either party, while a **pending** one
  still can; an offer cannot be repointed at another professional.
- **`deleteProject`.** A client deleting their own un-hired project removes its
  priceOffers, bundleOffers and the project itself — verified **gone, not
  orphaned**. Deleting a **hired** project is refused
  (`cannot-delete-hired-project`), and both the project and the owed fee doc
  survive the refusal.
- **`payFee`.** A stranger cannot pay (and so free) another pro's project; the
  client cannot call it; the owning pro can. Early payment credits `paidAmount`,
  records `feeLockedAmount`, and frees only that pro's slot. Paying twice is
  refused with `already-paid`.
- **`onReviewCreate`.** On one project with two pros, the review of the pro who
  still owes is **held**, and the review of the pro who has paid **publishes** —
  the per-pro hold, and the "still owes" check that stops `feeStatus`'s
  immutability from holding an early payer's review until the 60-day sweep.

### Key numbers asserted

| Scenario | Expected | Result |
|---|---|---|
| Two pros ₪2,000 + ₪1,000, only the second owes | fee ₪30 (3% of their own 1,000, not of 3,000) | ✓ |
| Bundle: two offers ₪3,000+₪2,000, bundlePrice ₪4,000 | base ₪4,000, fee ₪120 | ✓ |
| Pro A pays, B does not | A's slot freed and review published; **B still owes ₪30, still held**, project `slotActive` still true | ✓ |
| Early-pay ₪3,000, renegotiate **up** to ₪5,000, confirm | outstanding **₪60** — not ₪150, not ₪0 | ✓ |
| Early-pay ₪3,000, price **falls** to ₪1,000 | outstanding ₪0, no refund, `paidAmount` stays 90 | ✓ |
| Price falls to ₪1,000 with **nothing paid** | fee ₪30 — follows the real amount | ✓ |
| Missing fee doc (legacy) | settles as `exempt`, no fee, slot frees | ✓ |

The last two are why `baseAmount` at confirmation is the **current accepted
value**, not `max(hire-time, current)`. The earlier `max()` produced ₪90 on work
renegotiated down to ₪1,000 and never paid for. §5's no-refund guarantee is
carried by `outstanding` flooring at zero, not by pinning the base — the two
early-payment rows above are identical under either rule, so `max()` bought
nothing and overcharged in one reachable case.

## Known noise in the run

`onNewPriceOffer` throws `Cannot read properties of undefined (reading
'serverTimestamp')` during these runs. That is the **pre-existing**
`admin.firestore.X`-statics-are-undefined issue recorded above
(`notifications/triggers.ts`, 4 × FieldValue) — emulator-only, unrelated to this
change, and it affected no assertion.

## Still not covered

- **Composite indexes.** Unchanged: the emulator never validates them. The new
  `reviews projectId+professionalId+published` and the collection-group `fees`
  index were added by inspection. The reviews one is probably redundant —
  equality-only queries can use a zigzag merge join, which is why `freeSlot`'s
  three-equality query has always run index-free — but it is kept as insurance,
  since a missing index has already cost one production failure here.
- **The collection-group fees query itself.** The rule permitting it is in place
  and compiles, but nothing queries it yet; slice 2's cross-project fee list will
  be its first real exercise.
- **Nothing was deployed.** Rules, indexes and functions all remain local, joining
  the bundle already held pending the app release.

---

# Emulator limitation: `list` rules and document-ID conditions

Found 2026-09-04, the hard way. Sits alongside the composite-index gap above:
another thing local verification **cannot** tell you.

## The limitation

**The Firestore emulator cannot validate `list` (collection query) operations
against rule conditions that depend on the document-ID wildcard.** It allows
queries that production denies.

Production distinguishes what a rule condition depends on:

| Condition depends on | Available during `list`? |
|---|---|
| `request.auth` | yes |
| a **parent-path** wildcard (e.g. `{projectId}` for a subcollection) | yes |
| `resource.data.*` | yes — production allows the query |
| the **document-ID wildcard** (e.g. `{professionalId}`) | **no — query denied** |

A `get` binds the document-ID wildcard, so the same rule permits reading the
document directly. A `list` cannot bind it, so the query is refused outright.

## What it cost

`projects/{projectId}/removalRequests/{professionalId}`:

```
allow read: if isAuth() && (
  professionalId == request.auth.uid ||                  // doc-ID wildcard
  projectDoc(projectId).clientId == request.auth.uid     // parent path — fine
);
```

`listenToRemovalRequests` listened to the whole collection. Production denied it
for the professional; the error handler was `() => callback([])`, so the denial
rendered as "no pending removals" and the accept-removal banner never appeared.
The client's identical listener worked, because their clause reads the parent
project, which is document-independent — so the bug looked one-sided.

**The emulator run reported 18 passed / 0 failed, and one of those passing
assertions was `PRO collection listener works — got size=1`.** The emulator
appears to evaluate `list` per returned document with the wildcard bound. That
green run was not the assurance it was presented as.

Confirmed in production with a throwaway user and scratch documents (cleaned up):

| Operation | Professional | Client |
|---|---|---|
| `onSnapshot(collection(...))` | **DENIED** `permission-denied` | ALLOWED |
| `onSnapshot(doc(.../{uid}))` | ALLOWED | — |
| `getDoc` | ALLOWED | ALLOWED |
| `where(documentId(), '==', uid)` | ALLOWED | — |

Fixed by giving the professional a document listener
(`listenToMyRemovalRequest`) and keeping the collection listener for the client.

## Rule of thumb

If a read rule's permitting clause names the document-ID wildcard, that
collection **must not be read by an unconstrained query** by the user that clause
is for. Read the document directly, or constrain the query with
`where(documentId(), '==', uid)`. The emulator will not catch a violation.

## The Rules test API is not a substitute

`firebaserules.googleapis.com/…:test` **returns FAILURE for every `list`**,
including a control against a collection whose rule is `allow read: if isAuth()`
— which must succeed. Its `get` results are trustworthy (a three-way
allow/deny/unauthenticated control passed); its `list` results are worthless.

This was briefly reported as "confirmed: list is denied" on the strength of that
API before the control exposed it. **A tool that always fails is worse than no
tool** — it produces a correct-looking answer for the wrong reason. Any `list`
question must be settled against production. Always run a known-good control
before trusting a rules-testing tool.

## How to test `list` rules for real

Throwaway auth user via `createUserWithEmailAndPassword` (needs only the public
API key — no service-account signing, no impersonation), scratch documents keyed
to that uid, run the query, delete everything. `iam.serviceAccounts.signBlob` is
**not** granted to developer ADC, so `createCustomToken` is unavailable; do not
grant it just to test rules — that is token-minting authority over every account.
