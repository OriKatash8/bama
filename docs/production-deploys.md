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
