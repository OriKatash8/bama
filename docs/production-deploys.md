# What's live in production (bama-af0a0)

Answers "what's deployed?" without diffing against the console. **Append a row every
time you deploy rules or indexes, and only after verifying the live artefact against
the commit** by downloading it and diffing (`scripts/check-deploy-drift.mjs`, or fetching the
ruleset), never from the CLI's success message alone.

The commit is the last commit that changed the deployed file, so it stays correct
while later commits leave that file alone.

## ⚠ Held back on purpose (not deployed)

Email verification (`11f783a`) put its server half in the repo, but it must NOT go
live until the app update with the verify screen has shipped. Before that, old
installed builds would hit bare permission errors. Until then:

- **`firestore.rules`**: `verified()` differs from production on purpose, so the
  drift check reports rules drift. Don't run `firebase deploy --only
  firestore:rules` for anything else without first deciding about this.
- **`callClaude`**: now calls `assertVerifiedEmail`. Leave `functions:callClaude` out
  of any functions deploy until the app update is out, or it goes live early.
  (`createCommunityInvite` has the guard too, but it's held/undeployed anyway.)

When the update is out, deploy both, verify (`scripts/probe-email-verified-rules.mjs`),
record them below, and delete this section.

## Firestore rules (`firestore.rules`)

| Released (UTC) | Commit | Ruleset | How verified |
|---|---|---|---|
| 2026-09-26 00:29 | `233fc88` | (not captured) | Pre-deploy: live byte-identical to `c987f39`; `c987f39..233fc88` adds only the 16-line `users/{uid}/private/{docId}` block (phone number: owner-only read/write, doc `contact` only, keys `phone`+`updatedAt` only, `phone` must be E.164, no delete). Same file passed 12/12 cases on the emulator (`scripts/probe-phone-rules.mjs`), and removing the E.164 check made 3 fail. Post-deploy: drift check rules ok (released 2026-09-26T00:29:03Z) |
| 2026-09-25 20:55 | `c987f39` | `dab1742f-f2f7-4442-b02f-f876a9e4db2c` | Pre-deploy: live byte-identical to `5587b4a`, and `5587b4a..c987f39` is the only change to the file (communityEvents + memberStats rules; owner joinRequests update limited to status approved/rejected + decidedAt). Same file passed 32/32 rule cases on the emulator, incl. old-build approve/leave. Deployed by the user with `--only firestore:rules,firestore:indexes`. Post-deploy: live ruleset downloaded, byte-identical to `c987f39:firestore.rules` (== HEAD); drift check rules ok |
| 2026-09-24 10:43 | `5587b4a` | `16441152-fd10-4193-b8cb-a948d3345946` | **Not recorded at the time.** Found on 2026-09-25 while preparing the deploy above: live ruleset downloaded, byte-identical to `5587b4a:firestore.rules` (the last 30 rules commits were compared; only this one matched). Carries everything between `0152f73` and `5587b4a` (mentions bound, sender/system forgery, replyTo validation, frozen price) |
| 2026-09-17 15:59 | `0152f73` | `981106c2-7690-4424-a5d7-972bdae6335c` | Pre-deploy: live byte-identical to `5fe615c`, and `5fe615c..0152f73` touches only the V1 hunks (client cannot enter `in_progress`; create requires `open`; `paymentRequests` create `if false`). Post-deploy: live ruleset downloaded, byte-identical to `0152f73:firestore.rules`; drift check rules ok |
| 2026-09-13 15:01 | `5fe615c` | `3338f2ee-4058-4b42-bd08-5398c165ed12` | Live ruleset byte-identical to `5fe615c:firestore.rules` (pre-deploy: live == `c9e13e4`, so only the invite rules shipped); drift check clean; plain request, via-live-invite, revoked, foreign-invite and direct invite read exercised against production |
| 2026-09-13 14:49 | `c9e13e4` | `3a538282-f54b-47bd-be72-1774dc52d30a` | Live ruleset downloaded, byte-identical to `c9e13e4:firestore.rules`; drift check clean; joinRequests behaviour exercised against production |
| 2026-09-13 03:18 | `c9e13e4^` (pre-joinRequests fix) | `c8e5de71-a789-4fef-9d3c-4f4555d29dfc` | Byte-identical to `c9e13e4^:firestore.rules`, confirmed while diffing before the 14:49 deploy |

## Firestore indexes (`firestore.indexes.json`)

| Checked (UTC) | Commit | How verified |
|---|---|---|
| 2026-09-25 20:59 | `c987f39` | Pre-deploy drift check: the only missing composite was `messages (type ASC, timestamp ASC)` (the community dashboard's market-listings query). Deployed with the rules above; build polled via the Firestore Admin API: CREATING at 20:56:07Z, READY at 20:59:56Z. Drift check: all 16 present |
| 2026-09-13 15:02 | `335c0ad` | Pre-deploy: live == local, same 14 composites and field overrides, no extras. Deployed `--only firestore:indexes`; new `communityInvites (communityId, createdBy, revoked)` confirmed READY via the Firestore Admin API at 15:02:24Z; drift check: all 15 present |
| 2026-09-13 14:50 | `952f5d6` | Drift check: all 14 composite indexes in the file are present in production |

## Cloud Functions

No per-commit record. The drift check only confirms that every exported function name is
deployed (24 on 2026-09-13), not which source version is running.

Single-function deploys, verified by downloading the uploaded source from the
`gcf-v2-sources-*` bucket and diffing it against the commit:

| Released (UTC) | Function | Commit | Revision | How verified |
|---|---|---|---|---|
| 2026-09-26 01:00 | `onProjectClosed` (gen2, europe-west1 — the database region, nodejs22) — NEW, Firestore trigger on `projects/{projectId}` updates | `753c407` (main) | created | Posts the closing team-contact message (members, roles, phones, bama.app.hk@gmail.com) once when a project turns completed/cancelled. Pre-deploy: functions build clean; `closingNotice` (15), `closingTriggerWiring` (6) and `closingTriggerRun` (4, the handler against an in-memory store: posts once, a second closing posts nothing, cancel posts, other updates nothing) green. Post-deploy: ACTIVE, trigger filter `projects/{projectId}`; uploaded source zip downloaded, `src/` identical to `functions/src` at `753c407`, compiled `closingTrigger.js` writes the fixed id `project-closed`; no ERROR logs since. Not yet exercised by a real project ending |
| 2026-09-26 00:30 | `getContactPhone` (gen2, us-central1, nodejs22) — NEW | `233fc88` (main) | created | Pre-deploy: functions build clean, `npx jest functions/src` green incl. `contactPolicy` (12) and `contactWiring` (5); compiled `lib/index.js` exports it. Post-deploy: `gcloud functions describe`: GEN_2, nodejs22, ACTIVE; an unauthenticated call returns `UNAUTHENTICATED` ("Sign in required"). Deployed after the rules above, so no client could write a number before its doc was allowed |
| 2026-09-25 ~23:48 (`compressVideo` updateTime 23:48:48Z) | **45 functions**, same set as above: **runtime Node.js 20 → 22** (`engines.node` in `functions/package.json`; Node 20 is decommissioned 2026-10-30). No source change besides the engines field; `firebase-functions` stays 5.1.1 | `c117802` (main) | gen2 + gen1, 45/45 "Successful update operation" | Pre-deploy: functions build clean, `npx jest functions/src` 302/302, compiled `lib/index.js` loads under a real Node v22.23.3 (58 exports); drift check = baseline. Post-deploy: `gcloud functions list`: all 45 report runtime `nodejs22` (29 gen2 `ACTIVE`, 16 gen1 status `ACTIVE`); the Node 20 deprecation warning is gone from the deploy log; no ERROR-severity log entries from any function since the deploy. `compressVideo` (bundles `ffmpeg-static`) is `ACTIVE` on nodejs22 but has not been invoked since, so a real video upload is its first live test |
| 2026-09-25 ~22:56 (`markEngagementComplete` updateTime 22:56:42Z) | **45 functions**, the same set as 2026-09-17 (the 5 held invite functions and allowlisted `resolveCommunityInvite` excluded). Ships `f64e3a4` (price freeze: `derive.ts` writes `endedEngagementIds`, repricing refuses `engagement-finished`), `4ad039a` + `2798103` (@mention notifications) and `c987f39`. Rules and indexes not redeployed (already at `c987f39`) | `0d67ec9` (main) | gen2 + gen1, 45/45 "Successful update operation" | Pre-deploy: functions build clean, `npx jest functions/src` 302/302, drift check = baseline (only the 5 held invite functions undeployed). Post-deploy: source zips for `markEngagementComplete` and `createPaymentRequest` downloaded from `gcf-v2-sources-*`: `src/` identical to `functions/src` at `0d67ec9`, and compiled `derive.js` contains `endedEngagementIds` and `repricing.js` contains `engagement-finished`. **Only 2 of the 45 sources were diffed**, not all. Drift check afterwards unchanged. Backfill of `endedEngagementIds` run 2026-09-26, see "Data backfills" below |
| 2026-09-25 21:02 | `onNewCommunityMessage` (gen1, us-central1) | `25ec5b4` (main; the change itself is `c987f39`: also increments `chats/{chatId}/memberStats/{sender}.messageCount`) | versionId 7 | Source fetched via the Cloud Functions API (`generateDownloadUrl`): uploaded `src/` identical to `functions/src` at this commit, and compiled `lib/notifications/triggers.js` calls `bumpMemberStats`. Status ACTIVE. Pre-deploy: `functions/` built, 302/302 functions tests. Counts only messages sent from this deploy on (no backfill); at-least-once delivery can double-count a retried message |
| 2026-09-17 17:51–17:53 | **45 functions**: the V1 set plus new `acknowledgeCandidacy` and `declineCandidacy`. The 5 held invite functions and allowlisted `resolveCommunityInvite` are still excluded. Rules not redeployed (unchanged since `0152f73`) | `1fe0a05` (main, item 3: pro review card, client carousel, instruction lines, `candidate_declined`, bundle release V1 defect fix) | 29 gen2 + 16 gen1 | All 45 uploaded source zips downloaded, all timestamped this deploy (gen2 `gcf-v2-sources-*`; gen1 latest `version-N`). 45/45 `src/` identical to `1fe0a05:functions/src`. Compiled `lib/lifecycle/candidates.js` contains `acknowledgeCandidacy`, `removal.js` contains `bundlesSnap`, and `derive.js` contains `candidate_declined`. Drift check afterwards: rules ok, indexes ok, only the 5 held invite functions undeployed |
| 2026-09-17 17:11–17:13 | **43 functions** (same set as the V1 deploy; the 5 held invite functions and allowlisted `resolveCommunityInvite` again excluded). Rules not redeployed (unchanged) | `e0d171e` (main — sole-pro withdrawal fix, `derive.ts`) | 27 gen2 + 16 gen1 | All 43 uploaded source zips downloaded (gen2 `gcf-v2-sources-*`; gen1 latest `gcf-sources-*/…/version-N`, all timestamped 17:11–17:13Z); 43/43 `src/` identical to `e0d171e:functions/src` and compiled `lib/lifecycle/derive.js` contains `everCompleted`. Pre-deploy: read-only dry run of old vs new derivation on all 18 production projects' fee docs — 0 differ, all 7 completed stay completed. Drift check afterwards: rules ok, indexes ok, only the 5 held invite functions undeployed |
| 2026-09-17 15:59–16:01 | **43 functions** — every export except the 5 held community-invite functions (`createCommunityInvite`, `getCommunityInvite`, `revokeCommunityInvite`, `onCommunityInviteJoinRequest`, `onCommunityDeleted`, still waiting on the budget-alert confirmation) and allowlisted `resolveCommunityInvite`. New: `confirmCandidate`, `rejectCandidate` | `0152f73` (main, V1 candidate review) | 27 gen2 + 16 gen1 | Every function's uploaded source downloaded (gen2: `gcf-v2-sources-*/<fn>/function-source.zip`; gen1: latest `gcf-sources-*/<fn>-*/version-N/function-source.zip`, all timestamped this deploy); 43/43 `src/` trees identical to `0152f73:functions/src` and `lib/` contains `lifecycle/candidates.js` + `review.js`. Drift check afterwards: rules ok, indexes ok, only the 5 held invite functions undeployed |
| 2026-09-16 19:17 | `hireProfessional` | `ef8e0c3` (branch `fix/slot-cap-race`) | `hireprofessional-00009-ceq` | Uploaded `src/lifecycle/hire.ts` and `slotCap.ts` byte-identical to `ef8e0c3`; the compiled `lib/lifecycle/hire.js` calls `slotCapBlocksHire`. Also ships `0ec90eb` (hire in a transaction), which was not live before. Race probe against production: 5/5 rounds one ok + one capped, zero residue |

## Data backfills

| Run (UTC) | Script | Commit | Result | How verified |
|---|---|---|---|---|
| 2026-09-26 | `scripts/backfill-ended-engagement-ids.mjs --commit` (price freeze, after the 45-function deploy) | `0d67ec9` script, run at `c5856cc` | 34 projects scanned, 14 already correct, **20 written** (`endedEngagementIds` only) | Dry run reviewed first: every id is a pro whose fee is completed / withdrawn / cancelled, none `hired`, no fee doc missing `professionalId`. The script re-checked each written project against its fee docs (all match), and a second dry run afterwards found 34/34 correct, 0 to write. The only triggers on project updates (`onProjectClosed`, `onProjectEndDateChange`) are no-ops for this field; no ERROR logs from either |
