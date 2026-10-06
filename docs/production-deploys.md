# What's live in production (bama-af0a0)

Answers "what's deployed?" without diffing against the console. **Append a row every
time you deploy rules or indexes, and only after verifying the live artefact against
the commit** by downloading it and diffing (`scripts/check-deploy-drift.mjs`, or fetching the
ruleset), never from the CLI's success message alone.

The commit is the last commit that changed the deployed file, so it stays correct
while later commits leave that file alone.

**Functions have a machine-checked ledger, `docs/deploy-ledger.json`** (added 2026-10-06 after a
deploy on 2026-09-30 went unrecorded for a week). `node scripts/check-deploy-drift.mjs --project
bama-af0a0` downloads every deployed function's uploaded source, reduces it to a git tree hash,
and fails on any function that is live and not in the ledger, was updated since its entry, or runs
different source. It also names which commit each function's source equals. After you deploy and
have checked it, record it: `node scripts/check-deploy-drift.mjs --project bama-af0a0
--record-functions --only <names> --note "what and why"` (a name that is no longer deployed is
removed, which is how a deletion is recorded). Rows below remain the human-readable record.

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

> **Correction, 2026-10-06: this section no longer describes production.** The drift check
> reports `firestore.rules` **matches the repo** (released 2026-10-03T09:39:44Z, so `verified()`
> is in force), and `callClaude` and `createCommunityInvite` (which has the guard) are both
> **deployed**. Not deleted, because whether the app update with the verify screen has shipped is
> not recorded here; delete it when that is confirmed. See the next section for the invite functions.

## Community-invite functions: the hold, its conditions, and what is actually live (recorded 2026-10-06)

**The hold, as written.** Five functions (`createCommunityInvite`, `getCommunityInvite`,
`revokeCommunityInvite`, `onCommunityInviteJoinRequest`, `onCommunityDeleted`) were "held",
"still waiting on the budget-alert confirmation" (rows dated 2026-09-17 below). The detail is in
`docs/community-invites-spec.md` lines 19, 170 and 192: a **budget alert** and a **Cloud Monitoring
policy** set up and live, and the owner's confirmation. It names a condition and a confirmation by
the owner; no individual is named.

**The three pre-deploy conditions are met.**

| Condition | Status | How it is known |
|---|---|---|
| TTL on `rateLimits.expireAt` | **ACTIVE**, reported by the owner as of 2026-10-05 | Verified read-only 2026-10-06: `gcloud firestore fields ttls list --project bama-af0a0` → `state: ACTIVE` |
| Billing budget alert | **Live as of 2026-10-06** per the owner: scoped to `bama-af0a0`, ₪25 / month, alerts at 50 / 90 / 100 % to the owner's email | **Not verified from here.** The Cloud Billing Budget API is not enabled on the project, so `gcloud billing budgets list` cannot read it (I did not enable it). Recorded from the owner's statement |
| Cloud Monitoring policy | **Live as of 2026-10-06** per the owner: Cloud Function executions above 300, email | Verified read-only 2026-10-06: policy `BAMA function spike` is enabled, condition `Cloud Function - Executions`, one notification channel. **See the threshold note below** |

**Threshold note (not changed by me; the owner is lowering it to 5).** The condition is
`execution_count` aligned with `ALIGN_RATE` over a 300 s window, compared `> 300.0`, with
`duration: 0s` (a single window is enough) and no cross-series reducer (each function is judged on
its own). `ALIGN_RATE` is **per second**, so 300 meant about 90,000 executions in five minutes for
one function: it would never have fired. Measured 2026-10-06 from the same metric: it **does**
cover the 2nd-gen invite functions (45 functions have data under it), and the highest 5-minute
average rate any function reached in the last 7 days was **0.26 / s** (`onNotificationCreate`,
then 0.17 for `onCommunityDeleted`, 0.14, 0.12, ...). **A threshold of 5 is sane**: it is about 19
times the busiest normal window, equals 1,500 executions per five minutes per function, and equals
the spec's own worst case for a single rate-limited caller (300 per minute). It will catch a runaway
loop or a flood within one window. What it will not catch is a slow burn under 5 / s (up to roughly
430,000 executions a day), which the ₪25 budget alert is the backstop for. A lower pick such as 2
(8 times the observed peak) would warn earlier but would risk false alarms: an `@everyone` in a
600-member community is 600 `onNotificationCreate` executions within seconds, about 2 / s averaged
over a window.

**Observed use of the invite functions since 2026-09-30 (Cloud Run request logs, read 2026-10-06;
logs are kept 30 days).** The expectation was zero. It was not:

| Function | Requests | What they were |
|---|---|---|
| `createCommunityInvite` | **12**, all HTTP 400 | all on 2026-10-05 between 18:39 and 19:51 UTC, all from the native iOS app (`BAMA/1 CFNetwork Darwin/25.6`), none before. 400 is what a `failed-precondition` (`config/appLinks` missing) returns; the function's own log lines were not read individually |
| `getCommunityInvite` | **3**, all HTTP 200 | 2026-10-05 19:21 to 19:25 UTC, the same iOS app |
| `revokeCommunityInvite` | 0 | |
| `onCommunityInviteJoinRequest` | **41**, all 200 | 2 on 2026-10-02 and 39 on 2026-10-03 (Firestore triggers fire on every `joinRequests` write); nothing at WARNING or above. Consistent with the 10-02/10-03 demo-account seeding and cleanup (my inference) |
| `onCommunityDeleted` | **97**, all 200 | 13 on 2026-10-02 and 84 on 2026-10-03 (every chat deletion); nothing at WARNING or above. Same inference |
| `resolveCommunityInvite` | **0** | no request-log entry of any status in 30 days: no traffic at all, not even scanners. Its Cloud Run service grants `allUsers` the invoker role, so it was reachable |

All of it from one source: the owner's own phone, the evening of 2026-10-05. No external caller was
seen for any of the six. Data, read-only: `rateLimits` holds **0** documents (no oldest to report).
`getCommunityInvite` ran three times, so it will have written three; they expire within minutes and
the TTL policy deletes expired documents, so 0 is expected now, but "never written" cannot be told
apart from "written and swept". `communityInvites` 0, `communityInviteCodes` 0, `community_join_request`
notifications 0, `config/appLinks` absent.

**`callClaude` (investigated 2026-10-06; unchanged).**

- **What it is.** A public HTTPS callable (2nd gen, `us-central1`, 256 Mi, up to 20 instances; the
  Cloud Run invoker is `allUsers`, normal for a callable). It runs one of three fixed tasks
  (`project-title`, `crew-suggestion`, `crew-recommendation`) against the Anthropic API,
  model `claude-haiku-4-5`, with server-held prompts, output limits of 30 / 300 / 600 tokens and
  input limits of 4,000 / 4,000 / 6,000 characters. The caller supplies only a task name and one string.
- **Auth.** Required: unauthenticated callers are refused, an **unverified email** is refused, and each
  account is limited to **10 calls a minute and 60 a day** (the same Firestore rate limiter).
- **API key.** Yes: the Secret Manager secret `CLAUDE_API_KEY`, bound as an environment variable at
  **version 3**. I read secret **metadata only, never a value**. All three versions (all created
  2026-07-13) are still **enabled**, so versions 1 and 2, superseded keys, are still live credentials
  in Secret Manager if they are still valid at Anthropic. No key appears anywhere in the repo (0 matches).
- **What calls it.** Nothing. Three hooks call it through `core/services/aiService.ts`
  (`useGenerateTitle`, `useAiCrewSuggestion`, `useAiCrewRecommendation`); no screen imports any of
  them (two are re-exported from a barrel nobody uses; `useGenerateTitle` is imported by nothing). The
  source comment still says "NOT DEPLOYED", which is stale.
- **How it got there.** It existed before 2026-09-13, was **deleted on 2026-09-26 12:56 UTC** (the
  allowlist entry is dated the same day: undeployed on purpose), and was **re-created on 2026-09-30
  21:12 UTC**, three minutes before the invite functions, then updated 2026-10-01 23:27 to 23:28. That
  pattern is a deploy of every exported function, which undid the deliberate hold on all seven at once.
- **What is live is the hardened version.** Its uploaded source is byte-identical to HEAD; it does not
  accept a caller-supplied prompt, model or token limit.
- **Invocations.** In the 30-day log window it was called **4 times, all before the deletion** (one on
  09-18, two on 09-19, one on 09-20): **three HTTP 500 and one 204** (a CORS preflight), from two
  desktop Chrome sessions and two iOS app builds. **No call has succeeded in the window, and none at
  all since it was re-created on 09-30.** Nothing at WARNING or above was logged.
- **Exposure, in one line.** An account that has verified an email can spend at most 60 calls a day on
  small prompts; there is no cap across accounts, and **Anthropic spend is not covered by the Google
  Cloud budget alert**, so the Anthropic console's own spending limit is the control that matters.

**The hold had already been bypassed, before any of this.** Cloud Audit Logs, read 2026-10-06:

- all six community-invite functions (the five plus `resolveCommunityInvite`) were **created
  2026-09-30 21:15 UTC** under `orikatash8@gmail.com`, **updated 2026-10-01 23:29 UTC** (each twice),
  and `getCommunityInvite` was updated again on **2026-10-03** (06:15, 06:16, 08:59 and 09:00 UTC);
- none of it was recorded here, so this file kept saying "held" until today;
- the logs cannot say whether that was intended (a deploy of all functions would include them). The
  drift check also reports `callClaude` deployed, although it is allowlisted as not deployed; I did
  not look up when;
- so the functions ran **without** the TTL (until 2026-10-05), the budget alert and the Monitoring
  policy (until 2026-10-06). Whether anything hit the public `resolveCommunityInvite` in that time was
  **not checked**.

**What is live right now (verified read-only, 2026-10-06).**

- All six are `ACTIVE`, v2, `europe-west1`, `nodejs22`. `updateTime`: `createCommunityInvite`
  2026-10-01T23:29:09Z, `revokeCommunityInvite` …23:29:10Z, `onCommunityInviteJoinRequest` …23:29:11Z,
  `onCommunityDeleted` …23:29:09Z, `resolveCommunityInvite` …23:29:09Z, `getCommunityInvite`
  2026-10-03T09:00:08Z.
- **They run the 2026-09-26 code, not today's.** The uploaded source of `onCommunityInviteJoinRequest`
  was downloaded and diffed: its `invites.ts` is byte-identical to commit `11f783a3` (2026-09-26),
  `inviteCore.ts` to `00dd54a6`, `rateLimit.ts` to `acdaca40`. It contains **none** of the 2026-10-05
  work (no owner push, no cooldown stamps, no stamp cleanup). The other five were not diffed.
- **`config/appLinks` does not exist in production** (`seed-app-links.mjs --verify`: "config/appLinks
  does not exist"). Until it is seeded, `createCommunityInvite` fails with `failed-precondition`.
- Rules and indexes: drift check says `firestore.rules` matches (released 2026-10-03T09:39:44Z),
  `storage.rules` matches (2026-09-26T13:15:35Z), all 16 composite indexes present.
- Drift check: it found **7 stale allowlist entries**. The five that are staying deployed
  (`createCommunityInvite`, `getCommunityInvite`, `revokeCommunityInvite`, `onCommunityInviteJoinRequest`,
  `onCommunityDeleted`) were removed from `scripts/deploy-drift-allowlist.json` on 2026-10-06. Two remain,
  waiting on the owner: **`resolveCommunityInvite`** (decided: delete; the entry is correct again once it
  is deleted) and **`callClaude`** (investigated above, undecided).
- **`docs/deploy-ledger.json` was created on 2026-10-06** from what was live that day: 63 functions
  (48 2nd-gen, 15 1st-gen), every one's source matching an exact repo commit (none from an uncommitted
  tree). 54 are `baseline` (the state found, **not** individually verified when deployed) and 9 are
  `found-unrecorded` (the six invite functions, `callClaude`, `adminDeleteCommunity`,
  `adminCommunityAction`). The invite functions and `callClaude` run `functions/src` as of commit
  `1aa31494`; `getCommunityInvite` as of `6e435e4c`.
- Hosting: the `live` release is 2026-10-03 07:54:14 (CLI local time), the legal pages only.
  A preview channel `invite-test` exists (released 2026-10-05 22:15, expires 2026-10-06 22:15).

## Firestore rules (`firestore.rules`)

| Released (UTC) | Commit | Ruleset | How verified |
|---|---|---|---|
| 2026-10-01 | `b0fccbc` | (not captured) | Admins may READ project group chats (`type == 'group'`) and their messages, for the read-only admin/project-chat page; never DMs or purchase chats, never write. Pre-deploy: `b0fccbc` is the only commit to the file since `da15871`; deployed from a clean worktree of `b0fccbc` (another session's uncommitted `channelUnread` line was NOT shipped). Same file passed 10/10 on the emulator (`scripts/probe-admin-chat-rules.mjs`); removing either new line failed its own case. Post-deploy: drift check rules ok against `b0fccbc` |
| 2026-09-30 23:14 | `da15871` | (not captured) | Email addresses join phone numbers: `hasPhone` → `hasContact` with the combined RULES_CONTACT_PATTERN (one matches() per value). Pre-deploy: `da15871` is the only commit to the file since `bd7044b` (released 23:05); same file passed 26/26 on the emulator (`scripts/probe-contact-rules.mjs`), none denied by the 1000-expression limit. Post-deploy: drift check rules ok (released 2026-09-30T23:14:23Z); `scripts/probe-contact-rules-prod.mjs` 5/5 + teardown against production |
| 2026-09-30 23:05 | `bd7044b` | (not captured) | No phone numbers in public profile text (Terms §6.8): `profile/data` gains `profileWriteOk` — key allowlist, `hasPhone` on bio / equipment (≤15, per position) only when changed, priceList unchanged-or-empty. Pre-deploy: `git log` shows `bd7044b` is the only commit to the file since the previous release (2026-09-27 23:17, **not recorded here**); same file passed 22/22 on the emulator (`scripts/probe-contact-rules.mjs`), none denied by the 1000-expression limit. Post-deploy: drift check rules ok (released 2026-09-30T23:05:52Z); `scripts/probe-contact-rules-prod.mjs` 4/4 + teardown against production |
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
| 2026-10-03 06:15–09:00 | `getCommunityInvite` (four `UpdateFunction` calls: 06:15:48, 06:16:37, 08:59:10, 09:00:08Z) | not known | not known | **Not recorded at the time.** Found in the Cloud Audit Logs on 2026-10-06 (principal `orikatash8@gmail.com`). Source not diffed |
| 2026-10-02 15:01–15:13 | `adminDeleteCommunity`, `adminCommunityAction` (gen2, us-central1; `CreateFunction`, twice each) | not known | not known | **Not recorded at the time.** Found in the Cloud Audit Logs on 2026-10-06 while looking for the invite functions. Source not diffed |
| 2026-10-01 23:29 | `createCommunityInvite`, `getCommunityInvite`, `revokeCommunityInvite`, `resolveCommunityInvite`, `onCommunityInviteJoinRequest`, `onCommunityDeleted` (`UpdateFunction`, twice each, 23:29:01–23:29:11Z) | `onCommunityInviteJoinRequest`'s uploaded `invites.ts` == `11f783a3`, `inviteCore.ts` == `00dd54a6`, `rateLimit.ts` == `acdaca40` | not known | **Not recorded at the time**, and contrary to the hold above. Found in the Cloud Audit Logs on 2026-10-06 (principal `orikatash8@gmail.com`). Uploaded source of `onCommunityInviteJoinRequest` downloaded from `gcf-v2-sources-*` and diffed on 2026-10-06; the other five were not |
| 2026-09-30 21:15 | the same six (`CreateFunction`, 21:15:12–21:15:30Z) | not known | not known | **Not recorded at the time**; first creation of the six, while this file said they were held. Found in the Cloud Audit Logs on 2026-10-06 |
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
