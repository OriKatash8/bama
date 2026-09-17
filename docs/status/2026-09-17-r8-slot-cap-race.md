# R8 — slot-cap race fix (stage 1 of the candidate review work)

Branch `fix/slot-cap-race`, not merged. `hireProfessional` from this branch **is deployed to
production** (you approved deploy-then-probe).

## The bug
`loadAndEnforce` counted `projects where slotHolders array-contains proId` before the hire
transaction started. Two clients hiring the same professional onto two different projects at the
same moment both saw the count below `maxOpenProjects`, and both committed. The professional ended
up over the cap and nothing raised an error.

## The fix (`ef8e0c3`)
- `functions/src/lifecycle/slotCap.ts` (new): `slotCapBlocksHire`, a pure decision function. It
  takes the fresh `slotHolders` and a `readCount` callback, and only calls `readCount` when the hire
  would take a new slot.
- `functions/src/lifecycle/hire.ts` `commitHire`, inside `db.runTransaction`, in this order:
  1. `tx.get(projSnap.ref)`: re-reads the project.
  2. `slotCapBlocksHire({ freshSlotHolders: fresh.slotHolders, readCount: tx.get(capQuery) })`.
     The cap query runs **through the transaction**, and runs **before any write**.
  3. If blocked: `throw new HttpsError('resource-exhausted', 'slot-cap-reached')`. The client
     already handles this message and shows it with the same neutral text.
  4. Only after that do `acceptWrites(tx)` and the project, chat and fee writes run.
- The check before the transaction is unchanged. It is now only a fast fail, and its comment says so.
- No counter doc and no new index. The query is the same single-field `array-contains` as before.

### Does a retry re-read the count? Yes.
- `runTransaction` retries by **calling the whole update function again** from the top. Nothing is
  carried over between attempts.
- The count is read by `tx.get(capQuery)` inside that function, and the project is re-read by
  `tx.get(projSnap.ref)` just before it. So every attempt, including retries, takes a fresh project
  snapshot and a fresh count.
- `readCount` is a callback passed in per call, so the helper has nothing to cache.
- The unit test "re-reads the count on every call" models a concurrent hire landing between two
  attempts: attempt 1 sees 1 and allows, attempt 2 sees 2 and blocks, with 2 reads.
- The `HttpsError` thrown for the cap is an application error, not a contention abort, so
  Firestore does not retry it. It ends the transaction and reaches the client unchanged.

## Verification

### Unit tests (`functions/src/lifecycle/__tests__/slotCapInTransaction.test.ts`, 7 tests)
- **The decision:** blocks at the cap, allows below it, skips the count when the fresh project
  already holds the pro, and re-reads on every attempt.
- **Wiring, checked in `hire.ts`'s source** (same style as `hireAtomicity.test.ts`):
  - the cap query goes through `tx.get(db.collection('projects')…)`
  - it uses `fresh.slotHolders`
  - it comes before `acceptWrites(tx)` and every `tx.set`/`tx.update`
- **Mutation check, each change applied and confirmed by grep before running:**

  | Mutation | Result |
  |---|---|
  | M1: count read through `db` instead of `tx` | killed, 1 test failed |
  | M2: `acceptWrites(tx)` moved above the cap check | killed, 1 test failed |
  | M3: helper never blocks | killed, 2 tests failed |
  | M4: uses the pre-transaction `project.slotHolders` instead of `fresh` | killed, 1 test failed |

- **Full functions suite:** 186/186 passed. `functions/` type-checks clean.

### Emulator (`scripts/probe-slot-cap-race.mjs`)
The pro holds 1 slot of 2, and two hires onto two different projects are released together.

| Run | Rounds | Result |
|---|---|---|
| Transaction shape, OLD (count read before the transaction) | 20 | **20/20 over the cap** (both ok). This proves the probe can see the bug. |
| Transaction shape, NEW (`tx.get(query)` before writes) | 20 | 0/20 over the cap. Every round was one ok + one capped. |
| `hireProfessional` callable, **old build** (`HEAD~1:hire.ts`) | 10 | **10/10 over the cap** |
| `hireProfessional` callable, fixed build | 10 | 0/10 over the cap. Every round was one ok + one capped. |

The existing round trip (`probe-slot-cap-roundtrip.mjs`) was re-run with its now-removed
subscription import stubbed out, through a temporary copy that was deleted afterwards:
- a second role on the same project still succeeds
- still one `slotHolders` entry and one fee doc
- `baseAmount` is still 1700
- a third project is still refused with `slot-cap-reached`
- zero residue

### Production (`scripts/probe-slot-cap-race-prod.mjs`)
**Deploy:** `firebase deploy --only functions:hireProfessional`, revision
`hireprofessional-00009-ceq` at 2026-09-16 19:17 UTC.
- **Verified from the artefact, not the CLI message:** downloaded
  `gs://gcf-v2-sources-165833515213-us-central1/hireProfessional/function-source.zip`. Its
  `src/lifecycle/hire.ts` and `slotCap.ts` are byte-identical to `ef8e0c3`. Recorded in
  `docs/production-deploys.md`.
- **Note:** this deploy also shipped `0ec90eb` (hire runs in a transaction, which stops duplicate
  chats). The previous live build was from 2026-09-13 01:25 UTC and predated both. That closes
  STATUS.md open item 1 for `hireProfessional`.

**Probe:** live cap 2, 5 rounds, both hires fired together each round.

| Round | Results | Slots held afterwards |
|---|---|---|
| 1 | ok / capped | 2 |
| 2 | ok / capped | 2 |
| 3 | capped / ok | 2 |
| 4 | ok / capped | 2 |
| 5 | ok / capped | 2 |

**No real user was notified.**
- `onProjectCreate` sends "פרויקט חדש" (new project) to every matching professional when a project
  is open **and** has a vacant seat.
- Probe projects were created with their only seat pre-filled **and** `targetProfessionalId` set
  to the throwaway pro. The trigger returns early on either condition.
- The offer notifications (`onNewPriceOffer` → client, `onPriceOfferAccepted` → pro) went only to
  the two throwaway accounts.

## What was deleted from production
Stamp `race1789586319879`. The teardown deleted 54 items:

| What | Count | Detail |
|---|---|---|
| Firebase Auth users | 2 | pro `8rKgzyhsqaeTj8bb9d3e8wSL3ZG3`, client `3T0Gm7tBkLRFbCodLqbNUCCeGA82` |
| `users/{uid}` docs | 2 | written by `onUserCreate`; no subcollections |
| `projects/race1789586319879-{0..4}-{A,B,C}` | 15 | |
| `projects/…/fees/{pro}` | 5 | one per round, on the project whose hire landed |
| `priceOffers/race1789586319879-{0..4}-{B,C}-o` | 10 | |
| `chats/{auto}` | 5 | one per landed hire; no messages, since hiring posts none |
| `notifications/{auto}` | 15 | 10 "new offer" to the client, 5 "offer accepted" to the pro |

**Independent read-only sweep afterwards: 0 of everything.** It checked:
- projects by title and by clientId
- priceOffers by pro
- chats containing either uid
- notifications for either uid
- `users` docs
- Auth users
- a `fees` collection-group query by pro

## Left for you
- **Merge `fix/slot-cap-race`.** It carries 1 fix commit, plus this report, the prod probe script
  and the deploy record.
- **The rest of the functions are not redeployed.** Only `hireProfessional` changed. Other
  functions are whatever was live before.
- **Next:** V1, step a. It starts only after you give the go-ahead.
