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


RESULTS — rules deploy + production probe (2026-10-02, 02:25–02:36 UTC)
=======================================================================

Condition 1: a missing config doc or a missing field counts as OFF
------------------------------------------------------------------
The emulator rules probe now has 31/31 rows, including the new row
"config/pricing present, field ABSENT" (production's state before the probe).
All three creates are allowed in that state.

Condition 2: rules deploy and smoke test
----------------------------------------
- firebase deploy --only firestore:rules released at 02:29:14Z.
- The drift check reports firestore.rules as matching.
- The compiler warned at 42:14, which is pre-existing and not in this change.
- scripts/probe-fee-overdue-smoke-prod.mjs ran with the switch absent. A normal
  pro was ALLOWED to create a priceOffer, a bundleOffer and a
  projectApplication. Teardown asserted 0 docs left and 0 accounts leaked.
- No rollback was needed.

Condition 3: production probe (STAMP probe1790908193020)
--------------------------------------------------------
The probe ran to completion and its own teardown passed.

Result: 39 PASS, 2 FAIL. Both failures are in phase 3, right after the switch
was turned ON and the probe signed in as the pro.

  FAIL  pro sends a price offer — want DENY, got ALLOW (the FIRST create after
        the flip)
  FAIL  pro reads own feeBlocks — want ALLOW, got DENY

Everything else in that phase behaved as intended. Within 0.3 s:
  - the same pro's bundle offer and application were DENIED;
  - edits to an existing offer were allowed;
  - the fee, overdueAt, feeBlocks and switch writes were denied;
  - pro2 offered normally;
  - the client could not read feeBlocks;
  - hire of the blocked pro → 'fee-overdue';
  - hire of pro2 → ok.

All later phases passed:
  - kill switch off → allowed on the next request; on → denied;
  - markFeePaid cleared feeBlocks before it returned;
  - offer and hire both worked right after payment;
  - all resolveFeeDispute checks passed, including ₪30 restored, the clock
    restarted at now+7d, and ₪100 → ₪6 minimum.

Diagnosis so far:
  - In production, a fresh pro's own read of feeBlocks is ALLOWED, for a missing
    doc, blockedFrom null and a past blockedFrom. So the read rule is correct.
  - The exact sequence (client → flip → sign in as pro + token refresh → offer →
    bundle → edit → read) was replayed on the emulator. Every step came out
    correct, including the first offer DENIED and the read ALLOWED.
  - The trigger logs for the window show no errors.
  - So both anomalies are specific to production, and both sit in the first
    ~1 s after a user switch plus a switch flip. Not yet determined:
    - whether it is client-SDK credential timing after the switch;
    - or a short lag before a rules get() sees a just-written config doc.
  - Determining it requires flipping the production switch again, which goes
    beyond the single probe run that was approved.

Condition 4: proof, from scripts/probe-fee-overdue-sweep-prod.mjs
-----------------------------------------------------------------
  OK  config/pricing.feeOverdueBlockEnabled = false
  OK  admin  EcfweZVnLvWCmRo47TG11h27VyK2  auth/user-not-found  users doc=false  feeBlocks=false  notifications=0
  OK  pro    Xmvo7bFwhFhL9KW20btM1MfRyVF3  auth/user-not-found  users doc=false  feeBlocks=false  notifications=0
  OK  pro2   v83VcGYgFTfiLVt7EjfIEWUt0S42  auth/user-not-found  users doc=false  feeBlocks=false  notifications=0
  OK  client QvPiAkHcJFhYPhwcD8J6y3aIyc42  auth/user-not-found  users doc=false  feeBlocks=false  notifications=0
  OK  projects with id prefix probe1790908193020: 0
  OK  priceOffers / bundleOffers / projectApplications for the run: 0 / 0 / 0
  OK  chats for the run: 0
  CLEAN

The smoke run's own teardown separately asserted 0 docs left and 0 accounts
leaked.

Condition 5
-----------
The 7 flagged functions and the drift allowlist were not touched. The drift
check after the rules deploy lists exactly those 7 and nothing else.

Condition 6: NOT MERGED
-----------------------
Not every check passed. Branch feat/fee-overdue-block is unmerged and unpushed.
Note: production functions AND rules now run this branch's code. main does not
contain it.


FOCUSED PROBE — cause analysis (02:44–02:48 UTC, 05:44 Israel time)
===================================================================

1. Timeline of the first run (probe1790908193020), from Cloud Run request logs
------------------------------------------------------------------------------
The first run logged no per-step timestamps, so the client-side times below are
bounded by logged events.

  02:29:59.4     Admin write of the overdue fee. The trigger request was received
                 at 02:29:59.483.
  02:30:01.36    onFeeWrittenRecomputeBlock FINISHES (200, 1.876 s, cold start).
                 The probe's own Admin SDK poll then saw
                 blockedFrom == overdueAt (check 1 PASS).
  02:30:05.200   hireProfessional (switch-off phase) starts; it takes 7.112 s
                 and ends at 02:30:12.31.
  02:30:11.551   The trigger runs again for the hire's new fee doc (200, 0.129 s,
                 done by 11.68).
  ~02:30:12.4    Switch flipped ON. The first price offer was ALLOWED
  –13.9          somewhere in this window: after the hire returned and before
                 the next write's denial arrived at 13.999.
  02:30:13.999   The bundle offer's denial arrives.
  02:30:14.268   The application's denial arrives.
  02:30:14.3     The pro's read of their own feeBlocks was DENIED in this window
  –14.8          (between the application denial and the denial of the feeBlocks
                 write at 14.800).

The feeBlocks doc existed about 11 s before the first offer, and the only later
trigger run had finished about 1 s earlier. Trigger lag does not explain F1.

2. Focused run (probe1790909161344): switch ON for 16.4 s, 12 attempts, ALL correct
-----------------------------------------------------------------------------------
Before every client attempt, the Admin SDK read the server state:
feeBlocks.blockedFrom was set and switch = true every time.

  client     what it is                                          attempts at        result
  ---------  --------------------------------------------------  -----------------  -----------------------------------
  switch     signed in as client; switched to pro after the      +1.2 s, +15.8 s    offer DENY, read ALLOW (both times)
             flip with the original signOut / signIn /
             getIdToken(true) sequence
  warm       pro, signed in and warmed up (a read and a write)   +2.0 s … +15.2 s   all DENY / ALLOW
             11 s before the flip                                (8 delays)
  fresh1000  new SDK instance, signed in after the flip          +4.6 s             DENY / ALLOW
  fresh8000  new SDK instance, signed in after the flip          +9.3 s             DENY / ALLOW

  A  trigger lag:      EXCLUDED. The doc was present before each attempt, and in
                       the first run too.
  C  config lag:       EXCLUDED from +1.2 s onwards. Earlier, the first run's
                       phase 4 was also denied immediately after a flip.
  B  stale credentials: NOT reproduced with warm, fresh or client→pro instances.
                       Not replicated: the first run's exact instance history,
                       where ONE instance was pro (with writes), then client, then
                       pro again.

3. F2: why would a pro's read of their own feeBlocks be denied?
--------------------------------------------------------------
  match /feeBlocks/{userId} {
    allow read: if isOwner(userId);   // isOwner(uid) = request.auth != null && request.auth.uid == uid
    allow write: if false;
  }

- The rule never references `resource`, so it behaves identically whether or
  not the doc exists.
- Production confirms this: for a freshly signed-in pro the read is ALLOWED with
  the doc missing, with blockedFrom null, and with blockedFrom in the past.
- The ONLY way it can deny is a request that does not reach the server as that
  pro (unauthenticated, or another user's token). F2 is therefore a client-side
  credential mismatch on that request, not a rules behaviour.
- The app never reads feeBlocks (the client mirror reads the fee docs), so F2 has
  no product impact either way.

4. Status of the cause
----------------------
- F1 is NOT reproduced and NOT determined.
- Both anomalies sit in the same ~1 s after the same SDK instance went
  pro → client → pro.
- F2 can only be a client-credential effect. F1 cannot be fully explained by
  stale credentials: a stale PRO token is still the pro, and the allow decision
  is made server-side.
- The probe data that could settle it is gone: teardown deleted the allowed
  offer before anyone looked at it.
- The authoritative gate held in every run: hireProfessional refused the blocked
  pro ('fee-overdue'), so an offer that slips through still cannot become a hire.

No product code changed. Not merged.


THIRD RUN (single-instance replay) and CLOSE-OUT — 03:16–03:30 UTC (06:16 Israel time)
=====================================================================================

Merged first, as decided: main = origin/main = 61123b2 (fast-forward from
5423f15), pushed. The switch stayed off.

Pre-run answers, from the code (Firestore has no data-access audit logs, so the
logs cannot show what a write contained):
  - The trigger run that finished at 02:30:11.68 was for the switch-off hire's NEW
    fee doc on P_OFF. recomputeFeeBlock computes the earliest effective time over
    the pro's fees: P_DEBT's unchanged overdueAt, plus P_OFF with no overdueAt.
    That equals the stored blockedFrom, so it returns WITHOUT WRITING — neither
    null nor a new date.
  - The trigger is not switch-dependent. recomputeFeeBlock and
    onFeeWrittenRecomputeBlock never call readConfig; only the rules and the hire
    gate read the switch. A run started while the switch was off cannot clear the
    block.
  - The hire did not touch the overdue fee. commitHire writes only
    projects/{P_OFF}/fees/{pro}, which was a new doc. The overdueAt-clearing
    branch runs only for an existing PAID fee on the hired project.
  → None of these explains F1, so the third run went ahead.

Replay (probe1790910996430): one SDK instance, the first run's exact sequence
including the switch-off hire; Admin reads before and after every step.
  - Switch ON for 7.5 s. Switch commit time 03:28:54.871Z. All 7 switch-ON steps
    came out as intended:
      +1.6 s  offer        DENY
      +2.3 s  bundle       DENY
      +3.1 s  application  DENY
      +3.8 s  edit         ALLOW
      +4.4 s  read         ALLOW
      +6.9 s  offer        DENY
      +7.3 s  read         ALLOW
  - Before and after each step the Admin SDK saw feeBlocks.blockedFrom set
    (doc updateTime unchanged since 03:16:42) and switch=true.
  → F1 was NOT reproduced. No offer was allowed while ON, so there was none to
    inspect.

A different client-SDK anomaly appeared in the same pattern, while the switch was
OFF:
  - The FIRST write after as(pro) (signOut → signIn → getIdToken(true)) on this
    instance hung for 12 min (sent 03:16:45, returned 03:28:42) and then reported
    ERR already-exists.
  - The server had in fact CREATED it at 03:16:45.440Z. Inspected before cleanup:
      priceOffers/ftj6NmKhOLXjoUjTecNy  createTime 03:16:45.440Z
      The later hire accepted it.
  - So the client SDK lost the acknowledgement and re-sent the same write 12 min
    later. In this single-instance user-switching pattern, the client SDK reported
    a result that did not match the server's real decision. That is the same class
    of mismatch as F1 (a reported ALLOW) and F2 (a read evaluated without the
    pro's credentials).
  - It does not prove F1's mechanism.

Proof after the replay (sweep):
  - feeOverdueBlockEnabled = false
  - pro and client: auth/user-not-found, no users doc, no feeBlocks doc,
    0 notifications
  - 0 projects, offers, bundles, applications and chats left (1 chat found and
    deleted)
  - 0 debt fees left; 0 feeBlocks docs in production


KNOWN OPEN ITEM — accepted as a probe artifact (stop rule)
----------------------------------------------------------
F1 is closed as a probe artifact. In probe1790908193020, the first price offer
after the switch flipped ON was reported ALLOWED.
  - Not reproduced in 2 further production runs (19 switch-ON attempts, all
    correct).
  - Trigger lag and config propagation were excluded directly.
  - The only anomalies observed all sit in the client SDK after a signOut /
    signIn / token-refresh on ONE instance: F2, and the replay's lost write
    acknowledgement.
  - The authoritative gate held in every run: hireProfessional refused the
    blocked pro with 'fee-overdue'.
  - If it ever recurs: the rule decision is server-side. Check the offer's
    createTime against the switch commit time, and keep the doc.

Possible real-world relevance (not a rules issue, no change made): the replay
shows that on one device, a write made right after sign-out → sign-in can show
as hung or failed (already-exists) although it succeeded.

The production flips are finished; the switch is off.
