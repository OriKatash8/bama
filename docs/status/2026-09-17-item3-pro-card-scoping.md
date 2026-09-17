# Item 3: pro-side action card. Scoping report (no code)

## Context
- **Background:** V1 is live. The client's review card lets the client decide on each pro. The
  pro only gets a passive status chip.
- **Item 3:** give the pro the same three actions (רלוונטי / לא רלוונטי / שינוי מחיר) plus an
  instruction line.
- **Blocker, ships first:** the sole-pro withdrawal bug. Today a sole pro who withdraws flips the
  project to `completed` with no way back. Item 3's one-tap לא רלוונטי would expose that on every
  project.
- This is a scoping report. Nothing is implemented. After approval it is copied to
  `docs/status/2026-09-17-item3-pro-card-scoping.md`.

---

## 0. BLOCKER: sole-pro withdrawal completes the project

### What happens today
- `deriveProjectState` (`functions/src/lifecycle/derive.ts:119-133`) counts `withdrawn` as
  terminal. "All terminal" means complete, even when nobody delivered anything. The existing test
  `completes a project where EVERYONE withdrew` pins that behaviour.
- `applyDerivedProjectState` then sets `status: 'completed'` and `slotHolders: []`.
- **The client is stuck:**
  - the rules forbid leaving `completed`;
  - `canHireOnStatus` refuses new hires;
  - there's no reopen action.
- **Routes that hit it today:**
  - `respondToEngagementEnd` accepting a withdrawal (`completion.ts:754-757`, `pro_withdrew`);
  - `freeSlot` (`removal.ts`, `client_removed`).
- **Route item 3 would add:** a pro's one-tap decline.

### The fix you agreed
Drop `withdrawn` engagements from the completion decision **only when no engagement on the
project ever reached `completed`.**

### How "ever reached completed" is detected (no schema change)
Both completion paths stamp **`chargeDueAt`**:
- `confirmCompletionInternal`, `completion.ts:190/213`;
- `completeEngagementInternal`, `:830`.

Older records carry `disputeWindowEndsAt` instead. The existing accessor `contestWindowEndsAt(e)`
(`helpers.ts:258`) reads both. The stamp survives the later changes that matter:
- **Contest → `disputed`** (`completion.ts:906-924`) doesn't clear it.
- **Re-hire → `hired`** (`hire.ts:266-309`) doesn't clear it.
- **Withdrawal from `completed`** isn't possible: `requestEngagementEnd` refuses a terminal
  engagement.

The predicate:
`everCompleted(e) = e.engagementStatus === 'completed' || contestWindowEndsAt(e) != null`

`completion.state === 'confirmed'` also works as a belt-and-braces second signal.

### Change in `deriveProjectState`, pure and unit-testable
- Keep the C1 filter for `candidate_rejected`.
- Add: if **no** engagement passes `everCompleted`, also drop every `withdrawn` engagement. If
  nothing remains, the result is "no engagements", which is not complete.
- If any engagement ever completed, keep the withdrawn ones. The project closes as it does today.

### Effects
- **A project already rolled up to `completed` wrongly:** the next derivation (any engagement
  change, or a re-hire attempt) sees it isn't complete and returns it to `open`, through the
  existing reopen branch (`derive.ts:186-191`).
- **Live exposure:** a read-only scan on 2026-09-17 found **0** such projects (6 completed, all
  with delivered work). No repair script is needed.
- **The reopened project reappears on the noticeboard**, because `releaseEngagement` already freed
  the seats. That's the desired "find a replacement". A client who doesn't want one can cancel.
- **`slotHolders`:** unaffected. The released pro was already removed from it.

### Tests
- **Flip the existing "everyone withdrew → complete" test.**
- **New cases:**
  - sole `pro_withdrew` → open;
  - sole `client_removed` → open;
  - `[completed, withdrawn]` → complete;
  - `[disputed-after-completion (has chargeDueAt), withdrawn]` → not complete, because disputed
    holds it open;
  - `[hired-after-rehire (has chargeDueAt), withdrawn]` → not complete;
  - a legacy engagement with only `disputeWindowEndsAt` → counts as ever-completed.
- **Emulator probe:** a sole pro withdraws through `requestEngagementEnd` → client accepts →
  project `open`, re-hire allowed.
- Mutation-check the predicate and the drop.

### Ship
- Its own commit and **a deploy**. `derive.ts` is bundled into every lifecycle function, so it's
  the same 43-function deploy with the same zip verification.
- It must be live **before** item 3's decline button exists.

---

## 1. Pro's רלוונטי: what it means on the server (options with costs)

**Today:** `review: 'pending' | 'confirmed'` is the client's decision, stored on the accepted offer.
`isPendingReview` and `decideActivation` key off it.

### Option A: an independent acknowledgement (no gate)
- **Data:** a new `proAccepted: true` + `proAcceptedAt` on that pro's accepted offers, written by a
  new callable `acknowledgeCandidacy` (pro only, while his review is pending).
- **Client card:** a small tag on the row, "{name} אישר/ה", so the client knows the pro is in.
- **Unchanged:** `confirmCandidate`, activation and the `isPendingReview` definition.
- **Cost: low.** One field, one callable, one tag, one chip state, and tests.
- **Risk:** the client can still confirm someone who never acknowledged. That is today's behaviour,
  so nothing gets worse.

### Option B: mutual confirmation required (activation needs both)
- **Data:** split the decision into `clientDecision` and `proDecision`, or add a state:
  `review: 'pending' | 'client_confirmed' | 'pro_confirmed' | 'confirmed'`.
  - `isPendingReview` becomes "not both", **in both mirrors** (server `review.ts`, client
    `utils/review.ts`).
  - `decideActivation` needs both.
  - `confirmCandidate` stops being final: the row stays with "ממתין לאישור {name}".
- **New failure mode: deadlock.** A pro who never presses leaves the project unable to activate.
  The client's only way out is לא רלוונטי on a pro they wanted. That needs a nudge or a TTL, which
  is exactly what V1 cut.
- **In-flight V1 offers:** a missing `proDecision` would have to read as confirmed. Every pro hired
  between the V1 deploy and this one would then skip the step. The alternative is a backfill.
- **Touches:** `review.ts`, `candidates.ts`, both `isPendingReview` mirrors,
  `groupPendingByPro`, the chip, the card, `probe-candidate-review.mjs`, and the step (b) tests
  that pin today's semantics.
- **Cost: medium, and it brings back a stuck-state problem.**

### Option B2: ordered (the client's רלוונטי is disabled until the pro confirms)
- **Data:** same as B.
- **Difference:** worse for the client, who is blocked on the pro before deciding anything. Same
  deadlock.
- **Cost:** B plus extra UI states. **Not recommended.**

### Recommendation: A now
It delivers "the pro says he's in", visible to the client, without a new stuck state. B can be
added later if acknowledgements turn out to matter; A's `proAccepted` field becomes half of B's
data.

### Interaction with your price rule, which needs one clarification
You wrote: "once he confirms רלוונטי, the button is gone and today's unrestricted repricing
applies."
- **Under A**, that would allow unlimited pro requests while the **client** is still deciding.
  That undoes the one-unprompted limit the moment the pro acknowledges.
- **Proposed:** after the pro's רלוונטי, his שינוי מחיר button goes away, but he stays
  respond-only (counter rule) until the **client** confirms. Unrestricted repricing starts only
  after the client's רלוונטי, as today.
- **Needs your call.**

---

## 2. Price rule relaxation: one unprompted request per role while under review

**Current rule:** `priceRequestPolicy.decideNewPriceRequest` rule 4. A pro under review may only
counter the client's latest rejected proposal, once per proposal.

**New rule 4, in order:**
1. Pending anywhere for this (pro, role) → `price-change-pending`. **Unchanged.**
2. Client → allowed. Not under review → allowed. **Unchanged.**
3. **New:** if the history for this role contains **no pro-authored request at all** → allowed
   (his one unprompted request).
4. Otherwise the existing counter rule: latest client request rejected, with no pro request after
   it.

**What that means in practice:**
- After the client answers his unprompted request (accepted or rejected), step 3 no longer
  applies. He's back to respond-only, as you specified.
- **Edge:** history is per role and never reset. A pro released and later re-hired for the same
  category has already "used" his unprompted request. That's acceptable; say if you want history
  scoped to the current hire. Offers have no `acceptedAt`, so that would need a new field.

**Rules:** no change; `paymentRequests` stays server-owned.

**Tests:** the existing counter tests still hold. Add:
- first unprompted → allowed;
- second unprompted after the client rejects it → counter-not-allowed;
- unprompted, then the client proposes and the pro rejects → a counter is allowed.

---

## 3. Pro's לא רלוונטי: withdrawal

**Today there's no unilateral pro withdrawal.** `requestEngagementEnd({ kind: 'withdrawing' })`
asks, and the client must accept through `respondToEngagementEnd`. A rejected withdrawal becomes
`disputed`, with an admin review.

**Proposed:** a new callable `declineCandidacy({ projectId })`.
- **Checks:** the caller is on the project, still has an offer under review
  (`pendingReviewOffers`), and his engagement is plain `hired` (the same guard as
  `rejectCandidate`).
- **Then:** immediate `releaseEngagement(projectId, uid, 'candidate_declined')`, with no client
  approval, then `maybeActivateProject`.
- **Also closes** that pro's pending price changes, as `rejectCandidate` does.
- **Why no approval:** it's the pre-decision stage, where the client can already drop the pro
  unilaterally. Symmetry is fair.
- **After review is resolved** (client confirmed), the pro is back on today's
  request-and-approve withdrawal.

**UI:** `confirmDialog("לעזוב את הפרויקט?", body, { destructive: true })`, then the callable.

### Does it need its own `releaseReason`? Yes: `candidate_declined`.
- **Types:** add it to the `ReleaseReason` union, server and client.
- **Project completion (§0):** it must never complete a project. The generalized rule covers it
  whenever nothing completed. Also add it to the C1 filter next to `candidate_rejected`, so a
  decline never counts even on a project where someone else completed.
- **Reliability (`splitWithdrawals`):** leave it out of `withdrawn`, `byOwnChoice` and
  `byClientRemoval`, and count it in a new `candidateDeclines` bucket. Declining before anything
  was agreed isn't a reliability failure.
- **Why not reuse `pro_withdrew`:** that would count every "not for me" as walking out on agreed
  work.

### What the client sees when a pro declines
- **Today's message:** `releaseEngagement` posts the neutral "{name} עזב את הפרויקט" for every
  reason, to the group, **without a push**. The client's card row disappears on its own, since the
  offer goes to `removed`.
- **Proposed:** reason-specific text, set in `releaseEngagement` by `reason`:
  - `candidate_declined` → **"{name} החליט/ה לא להמשיך בפרויקט"**. It's clearer at this stage: he
    chose not to join, and nothing was abandoned.
  - `candidate_rejected` stays neutral, "עזב את הפרויקט", because the rejected pro's reason is
    private.
  - Others unchanged.
- **Plus a push** to the client (`system` type, opens the chat): "{name} החליט/ה לא להמשיך
  בפרויקט "{title}"". Otherwise the client only learns it when they open the chat.
- **Chat pill:** `parseSystemMessage` shows unmatched text as a `neutral` pill with a calendar icon.
  That's pre-existing, and it also affects "עזב את הפרויקט". Proposed: a `left` variant (person
  icon, muted) for both phrases. It's small and fixes the icon everywhere.

---

## 4. Component: reuse `CandidateReviewCard`, or a new component?
**A new `CandidateProCard`**, replacing `CandidateStatusChip`. Don't branch
`CandidateReviewCard`, because nearly every part differs:

| | Client card | Pro card |
|---|---|---|
| Data | all pros' offers (`listenToAcceptedOffers(projectId, null)`), grouped | his own offers only (a pro must scope the query or rules deny it) |
| Rows | N pros, names via `useUserBasics` | one, himself (no name lookup) |
| רלוונטי | `confirmCandidate` + dialog | `acknowledgeCandidacy` (option A) |
| לא רלוונטי | reason sheet → `rejectCandidate` | `confirmDialog` → `declineCandidacy` |
| שינוי מחיר | blocked by any pending; picks professionalId | the new unprompted rule; no professionalId |
| Blocked text | waiting on pro / pro countered | waiting on client / client asked (the chip's existing lines) |
| After decision | row disappears | confirmed → green "אושרת לפרויקט" chip until `in_progress` |

**Reused as is:** `PriceChangeSheet`, `useCandidateText` (with `dir`), `chromeStyles`,
`candidateService` (`listenToAcceptedOffers`, `proPrice`, `proReviewState`), and
`listenToPaymentRequests`.

**Small extraction:** move `ActionButton` out of `CandidateReviewCard.tsx` into
`candidates/ActionButton.tsx` so both cards share it.

**The chip's logic moves in:** `CandidateStatusChip`'s pending/confirmed/in_progress gating and
price line become the pro card's header. After his own acknowledgement (A) or the client's
confirmation, it collapses to the chip look.

### Instruction line: the client card has no such line today
The client card has only the title "החלטה על אנשי הצוות". There's no instruction for it to mirror.
Proposed, both sides, above the rows:
- **Pro:** "כדאי לדבר עם הלקוח/ה בצ׳אט ולוודא שהפרויקט מתאים לך לפני שמחליטים"
- **Client:** "כדאי לדבר עם אנשי הצוות בצ׳אט לפני שמחליטים"

That adds a line to the client card too. Say if the client side should stay as is.

---

## DECISIONS (2026-09-17)
1. **Pro רלוונטי:** Option A, an independent acknowledgement.
2. **After the pro's רלוונטי:** respond-only until the CLIENT confirms.
3. **Decline:** decline text + push to the client: yes. The `left` pill variant, for both phrases:
   yes.
4. **Instruction line:** on both cards.
5. **Unprompted history:** per role forever. No new field.

**Now: step 1 only (§0).** Commit, deploy with zip verification, report, then **STOP** before
item 3. The report must confirm, against production data, that the "ever completed" predicate
can't reopen any of the 6 real completed projects.

## 5. Proposed order
1. **Blocker (§0):** derive fix + tests + emulator probe → commit → deploy (43 functions, zip
   verification) → report.
2. **Item 3 server:** `candidate_declined` (types, derive filter, reliability bucket,
   reason-specific release message and push); `declineCandidacy`; `acknowledgeCandidacy` (if A);
   the price rule change → commit → report.
3. **Item 3 UI:** `CandidateProCard` (replacing the chip), `ActionButton` extraction, instruction
   lines, `left` pill variant, he + en → browser render pass → commit → report.
4. **One deploy** of steps 2 and 3 (rules unchanged), verification, and a live click-through,
   including the pro declining as sole pro, which confirms §0 end to end.

## Decisions needed from you
- **Pro רלוונטי:** A (recommended), B or B2.
- **After the pro's רלוונטי:** respond-only until the client confirms (proposed), or unrestricted
  immediately (as written).
- **Decline text + push to the client**, and the `left` pill variant: yes/no.
- **Instruction line on the client card too:** yes/no.
- **Unprompted-request history across a re-hire:** per role forever (proposed, no schema), or
  scoped to the current hire (needs a new field).
