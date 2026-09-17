# What's live in production (bama-af0a0)

Answers "what's deployed?" without diffing against the console. **Append a row every
time you deploy rules or indexes, and only after verifying the live artefact against
the commit** by downloading it and diffing (`scripts/check-deploy-drift.mjs`, or fetching the
ruleset), never from the CLI's success message alone.

The commit is the last commit that changed the deployed file, so it stays correct
while later commits leave that file alone.

## Firestore rules (`firestore.rules`)

| Released (UTC) | Commit | Ruleset | How verified |
|---|---|---|---|
| 2026-09-17 15:59 | `0152f73` | `981106c2-7690-4424-a5d7-972bdae6335c` | Pre-deploy: live byte-identical to `5fe615c`, and `5fe615c..0152f73` touches only the V1 hunks (client cannot enter `in_progress`; create requires `open`; `paymentRequests` create `if false`). Post-deploy: live ruleset downloaded, byte-identical to `0152f73:firestore.rules`; drift check rules ok |
| 2026-09-13 15:01 | `5fe615c` | `3338f2ee-4058-4b42-bd08-5398c165ed12` | Live ruleset byte-identical to `5fe615c:firestore.rules` (pre-deploy: live == `c9e13e4`, so only the invite rules shipped); drift check clean; plain request, via-live-invite, revoked, foreign-invite and direct invite read exercised against production |
| 2026-09-13 14:49 | `c9e13e4` | `3a538282-f54b-47bd-be72-1774dc52d30a` | Live ruleset downloaded, byte-identical to `c9e13e4:firestore.rules`; drift check clean; joinRequests behaviour exercised against production |
| 2026-09-13 03:18 | `c9e13e4^` (pre-joinRequests fix) | `c8e5de71-a789-4fef-9d3c-4f4555d29dfc` | Byte-identical to `c9e13e4^:firestore.rules`, confirmed while diffing before the 14:49 deploy |

## Firestore indexes (`firestore.indexes.json`)

| Checked (UTC) | Commit | How verified |
|---|---|---|
| 2026-09-13 15:02 | `335c0ad` | Pre-deploy: live == local, same 14 composites and field overrides, no extras. Deployed `--only firestore:indexes`; new `communityInvites (communityId, createdBy, revoked)` confirmed READY via the Firestore Admin API at 15:02:24Z; drift check: all 15 present |
| 2026-09-13 14:50 | `952f5d6` | Drift check: all 14 composite indexes in the file are present in production |

## Cloud Functions

No per-commit record. The drift check only confirms that every exported function name is
deployed (24 on 2026-09-13), not which source version is running.

Single-function deploys, verified by downloading the uploaded source from the
`gcf-v2-sources-*` bucket and diffing it against the commit:

| Released (UTC) | Function | Commit | Revision | How verified |
|---|---|---|---|---|
| 2026-09-17 17:11–17:13 | **43 functions** (same set as the V1 deploy; the 5 held invite functions and allowlisted `resolveCommunityInvite` again excluded). Rules not redeployed (unchanged) | `e0d171e` (main — sole-pro withdrawal fix, `derive.ts`) | 27 gen2 + 16 gen1 | All 43 uploaded source zips downloaded (gen2 `gcf-v2-sources-*`; gen1 latest `gcf-sources-*/…/version-N`, all timestamped 17:11–17:13Z); 43/43 `src/` identical to `e0d171e:functions/src` and compiled `lib/lifecycle/derive.js` contains `everCompleted`. Pre-deploy: read-only dry run of old vs new derivation on all 18 production projects' fee docs — 0 differ, all 7 completed stay completed. Drift check afterwards: rules ok, indexes ok, only the 5 held invite functions undeployed |
| 2026-09-17 15:59–16:01 | **43 functions** — every export except the 5 held community-invite functions (`createCommunityInvite`, `getCommunityInvite`, `revokeCommunityInvite`, `onCommunityInviteJoinRequest`, `onCommunityDeleted`, still waiting on the budget-alert confirmation) and allowlisted `resolveCommunityInvite`. New: `confirmCandidate`, `rejectCandidate` | `0152f73` (main, V1 candidate review) | 27 gen2 + 16 gen1 | Every function's uploaded source downloaded (gen2: `gcf-v2-sources-*/<fn>/function-source.zip`; gen1: latest `gcf-sources-*/<fn>-*/version-N/function-source.zip`, all timestamped this deploy); 43/43 `src/` trees identical to `0152f73:functions/src` and `lib/` contains `lifecycle/candidates.js` + `review.js`. Drift check afterwards: rules ok, indexes ok, only the 5 held invite functions undeployed |
| 2026-09-16 19:17 | `hireProfessional` | `ef8e0c3` (branch `fix/slot-cap-race`) | `hireprofessional-00009-ceq` | Uploaded `src/lifecycle/hire.ts` and `slotCap.ts` byte-identical to `ef8e0c3`; the compiled `lib/lifecycle/hire.js` calls `slotCapBlocksHire`. Also ships `0ec90eb` (hire in a transaction), which was not live before. Race probe against production: 5/5 rounds one ok + one capped, zero residue |
