# Community invites: status, 2026-09-13

Plain-text status report. The full spec is docs/community-invites-spec.md.

STATE
- Deployed and verified in production: rules 5fe615c (join-request re-request fix + invite
  rules), index 335c0ad (READY). Recorded in docs/production-deploys.md.
- Pushed, not deployed: step 0 deep-link intent layer (9131e12); step 2 invite functions
  (2f5ec79); drift-checker allowlist (401bcd7); config seed script (ff908d8, and the
  validator fix in this report's commit).
- STOPPED before the step 2 deploy. Waiting for you to confirm the budget alert and
  Monitoring policy are live. Nothing in runbook step (b) or later has been started.


ROLLBACK (use if anything goes wrong after the step 2 deploy)
Functions do not revert with a click. Deleting them is the kill switch. Always pass
--region europe-west1 and --project.

1. Triggers only. These fire on real user activity even though nobody uses invites:

   npx firebase functions:delete onCommunityInviteJoinRequest onCommunityDeleted --region europe-west1 --project bama-af0a0 --force

2. All five new functions:

   npx firebase functions:delete createCommunityInvite getCommunityInvite revokeCommunityInvite onCommunityInviteJoinRequest onCommunityDeleted --region europe-west1 --project bama-af0a0 --force

What to expect:
- Deletion takes about 1-2 minutes. Events arriving during it may still run. Events
  arriving after it are dropped, not queued.
- useCount stops counting (cosmetic).
- Community deletes stop cleaning up invites. Safe: a missing community already resolves
  as { exists: false }.
- Deleting the callables affects nothing; no app code calls them yet.

After a rollback, do all of these:
- Confirm they are gone:
  npx firebase functions:list --project bama-af0a0 | grep -i invite
- Run the drift check; it should list them as not deployed:
  node scripts/check-deploy-drift.mjs --project bama-af0a0
- Write the rollback window into docs/production-deploys.md: UTC start (delete issued),
  UTC end (redeployed, or "open"), and which functions.
- If onCommunityInviteJoinRequest was down: record that useCount is UNDER-COUNTED for
  invites during that window.

To restore: re-run the named deploy from runbook step (d).


SOAK EXIT CRITERIA (runbook step f; before step 4 wires any UI)
Duration: 48 hours, OR until both deliberate exercises pass cleanly and the logs are
quiet, WHICHEVER IS LONGER.

Deliberate exercises (production, throwaway data, cleaned up):
1. onCommunityDeleted on a non-community chat: create a throwaway project with its group
   chat, delete it through deleteProject. Logs must show the trigger invoked and exiting
   early: no reads, no writes, no errors.
2. onCommunityInviteJoinRequest on an ordinary join request: if no real Discover request
   happens during the soak, send one from a throwaway account to a throwaway group chat,
   with no inviteToken. Logs must show an early exit and no useCount write.

Must also hold for the whole soak:
- no errors in either trigger's logs
- no budget or Monitoring alerts
- zero invocations of the three callables

Step 3 (client plumbing) may be built during the soak ONLY while nothing imports
inviteService or the europe-west1 functions instance from a rendered path. If testing it
would need a screen, stop: that is step 4.


CHECK RESULTS (all run 2026-09-13 on the current commit)
- TypeScript (npx tsc --noEmit): 0 errors
- Jest full suite (npx jest): 50 of 50 suites, 583 of 583 tests pass
- Script tests (node --test scripts/__tests__/*.test.mjs): 33 of 33 pass
- Functions build (npm --prefix functions run build): clean
- Emulator probe of the invite functions (scripts/probe-invite-functions.mjs):
  36 of 36 checks pass
- Invite rules probe (scripts/probe-invite-rules.mjs): 18 of 18 as expected
- Join-request rules probe (scripts/probe-join-request-rules.mjs): 20 of 20 as expected
- Drift check against production: rules ok; 15 indexes ok; resolveCommunityInvite
  allowlisted (day 0 of 60); DRIFT on exactly the 5 functions due in the step 2 deploy,
  which is expected until then


VALIDATOR QUESTION
Was: seed-app-links --verify used its own copy of the https-origin check, with only a
test comparing it to the real one.
Now: scripts/lib/appLinks.mjs imports the real buildInviteUrl from
functions/src/communities/inviteCore.ts as TypeScript source (not a copy, not the
possibly-stale compiled functions/lib). A test asserts it is the same function object,
and a test fails if appLinks.mjs contains its own URL rule. Loosening the real function
(allowing http) makes the script's tests fail. One constructor in inviteCore.ts was
rewritten without a parameter property so Node can import the source; the 38 core unit
tests and the functions build still pass.
