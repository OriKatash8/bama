# Item 3, step 1: sole-pro withdrawal fix

**Status:** deployed and verified. **Stopped before item 3.**

| | |
|---|---|
| Commit | `e0d171e` on main (pushed) |
| Deploy | 43 functions, 2026-09-17 17:11–17:13 UTC |
| Rules | not redeployed (unchanged) |

## The bug
- A project whose only professional withdrew (withdrawal accepted) or was removed rolled up to
  `completed`.
- `deriveProjectState` counted `withdrawn` as terminal, and "all terminal" meant complete.
- **The client was stuck:**
  - slots emptied;
  - `hireProfessional` refused the project (`project-not-hireable`);
  - a client can't leave `completed`.
- Item 3's one-tap לא רלוונטי for pros would have made this reachable on every project.

## The fix (as agreed)
**Rule:** withdrawn engagements are dropped from the completion decision **only when no engagement
on the project ever completed**.

**"Ever completed"** is `everCompleted(e)`:
- `engagementStatus === 'completed'`, **or**
- a contest-window stamp (`chargeDueAt`, or legacy `disputeWindowEndsAt`, read through
  `contestWindowEndsAt`).

Both completion paths write that stamp, and nothing clears it afterwards:
- a contest moves the engagement to `disputed` and keeps it;
- a re-hire moves it back to `hired` and keeps it;
- a completed engagement can't be withdrawn.

**Why the condition matters, not just "always drop withdrawals":** with any other completed
engagement present, both give the same result. They differ in exactly one case: every engagement is
withdrawn, but one of them had completed before. Example: a pro completed his work, was re-hired for
a further role on the same project, then withdrew. Work was delivered, so the project closes.
Dropping withdrawals unconditionally would wrongly reopen it. The first mutation run showed this
case had no test (see Tests).

## Can it reopen a project that should stay completed? No, checked against production.

**Read-only dry run, before deploying:**
- The old derivation (`main:derive.ts`) and the new one were compiled side by side and run on the
  **real fee docs of all 18 production projects**.
- **Projects where old and new disagree about completion: 0.**
- Production today has **7** completed projects, not 6: one more completed since the morning scan.
- **All 7 stay completed under the new rule.** Each has exactly one engagement, `completed`, with a
  `chargeDueAt` stamp (`everCompleted` = 1):
  `9gkkYCusbSq4EVrieowq`, `UgG20IewSfrro7Qjq5Fg`, `iQPcscfkLXDFlClbcccR`, `k84rLMQgWUQvceqWVxrL`,
  `mEflWmh0GQIzl1za1JVJ`, `oeTrdLpOquFr1Wa4gUaT`, `yTprPSKOdQcf3Br9UFXW`.
- The other 11 projects are `open`, with no change in completion.

**Why the predicate can't misfire on a genuinely completed project:**
- A project only rolls up to `completed` when every engagement is terminal.
- Before this fix, the only terminal states were `completed`, `withdrawn` and `cancelled`.
- A project the fix could reopen would need **no** engagement that is `completed` **or** stamped.
  The completion path writes that stamp in the same update that sets `completed`, so a project
  where real work was delivered always has at least one.

**No repair script is needed.** No production project is stuck in `completed` without delivered
work, which the dry run confirms: 0 differences. Derivation also only runs when an engagement
changes, so no stored status was rewritten by the deploy.

## Tests
- **`derive.test.ts`:**
  - the old pin "everyone withdrew → complete" is flipped to "not complete, no engagements";
  - sole `pro_withdrew`, `client_removed` and legacy (no reason) → open;
  - completed + withdrawn → complete;
  - completed-then-contested + withdrawn → held open as disputed;
  - completed-then-re-hired + withdrawn → open;
  - legacy `disputeWindowEndsAt` completion → counts;
  - **only withdrawals left, one of them previously completed → complete** (the case the condition
    exists for);
  - an `everCompleted` table of 7 cases.
- **Mutation check, 5 mutations, all caught in the end:**

  | Mutation | Result |
  |---|---|
  | W1: withdrawals not dropped (the old behaviour) | killed |
  | **W2: withdrawals dropped unconditionally** | **survived at first**, killed after the "previously completed then withdrew" test was added |
  | W3: predicate ignores the contest stamp | killed |
  | W4: predicate ignores the legacy field | killed |
  | W5: only reason-tagged withdrawals dropped | killed |

- **Gate:** root 902/902 (includes the functions suites); root and functions typecheck clean.
- **Emulator probe** `scripts/probe-sole-pro-withdrawal.mjs`, with the real callables:
  1. A sole pro requests withdrawal and the client accepts → project **open**, seat vacant, fee
     `withdrawn`, and **a replacement is hired**.
  2. Control: A marks complete, B withdraws and the client accepts → project **completed**.
  3. **Against `main`'s old `derive.ts`**, run on the same emulator:
     - "project stays OPEN" **fails** (it was `completed`);
     - "client can hire a replacement" **fails** (`project-not-hireable`).

     So the probe does catch the bug.

## Deploy and verification
- **Same 43 functions as the V1 deploy.** The 5 community-invite functions are still held;
  `resolveCommunityInvite` stays allowlisted. Rules are unchanged, so not redeployed.
- **Artefacts:** all 43 uploaded source zips downloaded (27 gen2, 16 gen1 from the latest
  `version-N`, all timestamped 17:11–17:13 UTC). **43/43** `src/` trees identical to
  `e0d171e:functions/src`, and every compiled `lib/lifecycle/derive.js` contains `everCompleted`.
- **Drift check:** rules ok, indexes ok (15), only the 5 held invite functions undeployed.
- Recorded in `docs/production-deploys.md`.

## Next (not started)
Item 3 per the scoping report `docs/status/2026-09-17-item3-pro-card-scoping.md` and your decisions:
- **Option A:** the pro's רלוונטי is an independent acknowledgement.
- **Respond-only** after the pro's רלוונטי, until the client confirms.
- **Decline:** `candidate_declined`, with its own message and push, and the `left` pill variant.
- **Instruction line** on both cards.
- **Unprompted price-request history** stays per role, forever.
