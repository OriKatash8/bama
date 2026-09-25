# Deploy runbook — price freeze after "finish my part"

**Problem:** after a professional finishes their part, the client (and older pro
builds) still see "update price". The freeze (`f64e3a4`, 2026-09-23) is in the
code but was never deployed: the last full functions deploy was `1fe0a05`
(2026-09-17). Production never writes `projects/{id}.endedEngagementIds`, and
`createPaymentRequest` does not refuse a finished engagement.

## What ships

A full functions deploy ships every `functions/src` change since `1fe0a05`:

| Commit | What |
|---|---|
| `f64e3a4` | **the price freeze**: `derive.ts` writes `endedEngagementIds`; `createPaymentRequest` / `respondToPaymentRequest` refuse with `engagement-finished` |
| `4ad039a`, `2798103` | @mentions: notification path and fan-out (`notifications/triggers.ts`, `fanOut.ts`, `recipients.ts`) |
| `c987f39` | community membership log (`onNewCommunityMessage` alone already shipped on 2026-09-25) |

Rules and indexes are already at HEAD (deployed `c987f39`), so they don't need redeploying.

**Set:** 45 functions, the same set as the 2026-09-17 deploy. Every export except the
5 held invite functions (`createCommunityInvite`, `getCommunityInvite`,
`revokeCommunityInvite`, `onCommunityInviteJoinRequest`, `onCommunityDeleted`) and
allowlisted `resolveCommunityInvite`.

## Pre-deploy (already done, at HEAD)

- `cd functions && npm run build`: clean. `lib/lifecycle/derive.js` contains `endedEngagementIds`
- `npx jest functions/src`: 302/302
- backfill logic: `node --test scripts/__tests__/endedEngagements.test.mjs` 7/7

## 1. Drift check (before)

```
node scripts/check-deploy-drift.mjs --project bama-af0a0
```

Expect rules and indexes ok, and only the 5 held invite functions undeployed.

## 2. Deploy

```
firebase deploy --project bama-af0a0 --only functions:acknowledgeCandidacy,functions:adminListArrears,functions:adminListFlaggedProjects,functions:callClaude,functions:cancelProject,functions:completeAllEngagements,functions:compressVideo,functions:confirmCandidate,functions:confirmCompletion,functions:contestEngagement,functions:createPaymentRequest,functions:declineCandidacy,functions:deleteProject,functions:disputeCompletion,functions:disputeFeeByPro,functions:freeSlot,functions:getAdminStatus,functions:hireProfessional,functions:lifecycleCron,functions:markDemandSent,functions:markEngagementComplete,functions:markFeePaid,functions:moderateUser,functions:onBookingCreate,functions:onMarketplacePurchase,functions:onMeetingCreate,functions:onMissionCreate,functions:onNewChatMessage,functions:onNewCommunityMessage,functions:onNewPriceOffer,functions:onNotificationCreate,functions:onPriceOfferAccepted,functions:onProjectCreate,functions:onProjectEndDateChange,functions:onRemovalRequest,functions:onReviewCreate,functions:onUserCreate,functions:rejectCandidate,functions:requestCompletion,functions:requestEngagementEnd,functions:respondToEngagementEnd,functions:respondToPaymentRequest,functions:sendSystemMessage,functions:setAdminClaim,functions:setSubscription
```

## 3. Post-deploy verification

- Drift check again: expect the same as step 1.
- Uploaded source matches HEAD. Download the source zips and diff `src/` against
  `functions/src`, as in the earlier rows of `docs/production-deploys.md`. At
  minimum, `derive.js` contains `endedEngagementIds` and `repricing.js` refuses
  `engagement-finished`.

## 4. Backfill (after the deploy)

Engagements that finished before the deploy have no array until the project
next changes. The script writes only `endedEngagementIds`, and only where it
disagrees with the fee docs. It uses the compiled server rule from
`functions/lib` and refuses to run if that build is stale.

```
node scripts/backfill-ended-engagement-ids.mjs --project bama-af0a0            # dry run: lists every project it would change
node scripts/backfill-ended-engagement-ids.mjs --project bama-af0a0 --commit   # writes, then re-checks each project
```

Check the dry-run list before committing. Every "next" id should be a pro whose
fee shows `completed`, `disputed`, `withdrawn` or `cancelled`. If the script
reports "Ended fee docs with no professionalId", look at those before trusting it:
the server skips them too, so their price stays editable.

## 5. Manual check

On a project where a pro has finished their part:
- client's project details: no "update price" on that pro's card
- the pro's own card: no "update price"
- another pro on the same project who hasn't finished still has it

## 6. Record

Add a row to `docs/production-deploys.md` (functions table), and one for the
backfill.
