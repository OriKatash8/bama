2026-10-02 — Overdue fee → hiring block
=========================================

Branch: feat/fee-overdue-block. Code commit: 76f1e02.
Kill switch config/pricing.feeOverdueBlockEnabled: FALSE in production (never set).

STATUS
------
  [done]     Code, tests, mutation checks, emulator rules probe
  [deployed] Functions (34, by name) + the fees.overdueAt index. The index was
             still CREATING at the time of writing.
  [WAITING]  firestore.rules deploy — needs your approval (diff below)
  [WAITING]  Production probe — needs the rules live; it flips the switch on
             for about 3 minutes, then restores it


WHAT IS LIVE NOW (functions deployed, switch off)
-------------------------------------------------
Behaviour change with the switch OFF:
  1. settleFee now treats a completed ENGAGEMENT as confirmed (before, it
     looked only at the project's completion.state). markFeePaid on an
     engagement that completed while the project stayed open now charges the
     stored feeDue. Before, it repriced from the accepted offers. This is the fix
     the plan flagged.
  2. contestEngagement also writes preDispute {feeDue, status, baseAmount}.
  3. resolveFeeDispute callable exists (admin only). The admin "Needs review"
     tab shows the buttons once this app build ships.
  4. adminListFlaggedProjects rows gain `disputes`. adminListArrears "blocked"
     also counts the overdue gate when the switch is on.
  5. The onFeeWrittenRecomputeBlock trigger (europe-west1) maintains
     feeBlocks/{proId} on every fee write. No overdueAt has been stamped yet, so
     every value is null.
  6. feeOverdueCron runs hourly and returns immediately while the switch is off.

Unchanged with the switch OFF: no overdueAt is stamped, the hire gate skips the
overdue check, the rules (still the old ones) don't check it, and the app shows
no banner or dialog.


RULES DIFF AWAITING APPROVAL
----------------------------
Deployed ruleset == git HEAD~1 (verified byte-for-byte against the live
ruleset), so this is the ENTIRE difference:

  offerCreateValid():   ... && offerPriceInRange()  →  ... && offerPriceInRange() && !feeOverdueBlocks()
                        (covers priceOffers AND bundleOffers create)
  projectApplications:  allow create: if isAuth()   →  if isAuth() && !feeOverdueBlocks()
  NEW function feeOverdueBlocks():
      exists(config/pricing)
      && config/pricing.feeOverdueBlockEnabled == true      ← kill switch, read live
      && exists(feeBlocks/{uid})
      && feeBlocks/{uid}.blockedFrom != null
      && request.time >= feeBlocks/{uid}.blockedFrom
  NEW match /feeBlocks/{userId}: read if owner, write false.

Cost: up to 2 extra document reads per offer or application create. Updates to
existing offers are not touched.
With the switch off, the new clause is always false, so creates behave exactly
as they do today. Two cases checked in the emulator:
  - config doc missing    → still allowed (row 16-18)
  - switch = string "true" → treated as off (row 19)

Deploy command:  firebase deploy --project bama-af0a0 --only firestore:rules


VERIFICATION SO FAR
-------------------
Unit tests: 2900/2900 tests and 331/331 suites green at the code commit.
Typecheck: app 0 errors, functions 0 errors.

Mutation checks: 16/16 killed. Each mutation asserted its anchor applied before
running its test. Covered:
  - the disputed pause
  - max(overdueAt, chargeDueAt), server and client
  - strict === true on the switch
  - the hire-gate throw
  - settleFee's direct recompute
  - settleFee's engagement-completed pricing
  - the stamp being off while the switch is off
  - due-notice dedupe
  - preDispute restore
  - the rules clause on offerCreateValid
  - the client hook's switch and timer
  - the modal's pre-submit and refusal mapping
  - the admin price range

Two mutations survived on the first run and were fixed:
  - hire wiring regex was too loose → tightened
  - a redundant check in dueNoticeOwed (equivalent mutant) → removed

Emulator rules probe, scripts/probe-fee-overdue-rules.mjs: 28/28.
  switch off + past block       → offer/bundle/application ALLOW
  switch on  + past block       → all three DENY
  block in the future           → ALLOW
  blockedFrom null              → ALLOW
  no feeBlocks doc              → ALLOW
  config doc missing            → ALLOW
  "true" string                 → ALLOW
  another pro                   → ALLOW
  pro marks own fee paid        → DENY
  pro clears overdueAt          → DENY
  pro sets engagementStatus     → DENY
  pro writes feeBlocks          → DENY
  pro writes config             → DENY
  client / other pro reads feeBlocks → DENY
  pro reads own feeBlocks       → ALLOW

Note: the emulator logs "evaluation error at L973:24" on the DENY rows. The same
label appears for a pre-existing deny (an out-of-range price, unrelated to this
change), so it is how the emulator reports a failed && chain on these rules, not
an error introduced here. The outcomes are correct either way.

Drift check after the functions deploy: functions OK (45/45 exported-and-due are
deployed), indexes OK, storage.rules OK, firestore.rules DIFFERS (this change).
Pre-existing, not from this work: 7 deploy-drift-allowlist entries are flagged
"is deployed now" (resolveCommunityInvite, callClaude, createCommunityInvite,
getCommunityInvite, revokeCommunityInvite, onCommunityInviteJoinRequest,
onCommunityDeleted). Left untouched. This needs a separate decision.


PRODUCTION PROBE PLAN (scripts/probe-fee-overdue-prod.mjs), after the rules deploy
---------------------------------------------------------------------------------
Uses throwaway accounts: pro (overdue fee), pro2 (clean), client, admin
(role:admin claim; deleted at the end). Before running, it asserts out of the
source that the payloads and the hireProfessional({offerId}) call match the
shipped code.

  1. Seeding the overdue fee → the trigger writes feeBlocks/{pro}.blockedFrom == overdueAt
  2. Switch OFF: the pro sends an offer, a bundle and an application, and is hired
  3. Switch ON:
     - the pro is DENIED all three creates
     - editing an existing offer still works
     - writes are denied for: own feeBlocks, own fee marked paid, overdueAt
       cleared, the switch
     - pro2 offers normally
     - the client cannot read the pro's feeBlocks
     - after the 65s config-cache wait:
       - hire of the pro → 'fee-overdue'
       - hire of pro2    → ok
  4. Switch OFF → the pro's offer is allowed on the next request; ON → denied again
  5. Payment:
     - the pro cannot call markFeePaid
     - the admin calls markFeePaid → feeBlocks is null when it RETURNS
     - the pro offers immediately and is then hired
  6. resolveFeeDispute:
     - a non-admin is refused
     - didnt_happen → completed restores ₪30, with overdueAt = now + 7d
     - the slot is released and the review flag cleared
     - an agreed ₪100 → ₪6 (the minimum fee)
     - cancelled → not_owed
     - pro2's block is ~7 days out, so pro2 still offers
  Teardown:
     - the switch is restored FIRST and asserted
     - accounts, projects, offers, applications, chats, notifications, feeBlocks
       and users are deleted, and each deletion is asserted

The switch is on in production for about 3 minutes. The script refuses to start
if the switch is already on. During that window no real fee has an overdueAt
(nothing completed while the switch was on), so no real professional can be
blocked.


KNOWN LIMITS / DECISIONS TO NOTE
--------------------------------
  - Push text is Hebrew. The server has no idea of the user's language (it lives
    on the device only), same as every existing push. The server holds he + en
    copy and would use users/{uid}.language if that field ever exists. All
    in-app text (banner, dialog, admin) is he + en.
  - Re-enable caveat (confirmed in plan review):
    - a fee stamped while the switch was on, whose time passed while the switch
      was off, blocks again as soon as the switch is turned back on;
    - in that case only "block started" is sent, not the 1-day warning.
  - A second role on a project where the pro is already hired counts as a new
    hire, so it is blocked. This matches the existing arrears gate.
  - The admin dispute buttons need the next app build. The callable works now.


NEXT
----
  1. Your approval → firebase deploy --only firestore:rules, then the drift check
  2. node scripts/probe-fee-overdue-prod.mjs → results appended here
  3. Merge feat/fee-overdue-block → main (not done; your call)
  4. Turning the switch on for real is a console edit of
     config/pricing.feeOverdueBlockEnabled = true (boolean). Not done.
