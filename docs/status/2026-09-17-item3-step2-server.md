# Item 3, step 2: the professional's side of the review (server)

Branch `feat/item3-pro-card`, commit `1ac1376`. **Nothing deployed. Stopped before step 3.**

---

## 1. What was built

**`acknowledgeCandidacy({ projectId })`, the pro's רלוונטי (Option A)**
- **Who may call it:** a professional on the project who is not its client
  (`loadAsCandidate`), and only while at least one of his offers is under review. Otherwise it
  refuses with `not-under-review`.
- **What it writes:** `proAccepted: true` + `proAcceptedAt` on those offers and bundles. Nothing
  else changes:
  - the client's `review`
  - `confirmCandidate`
  - `isPendingReview`
  - activation
- **Idempotent.**
- **Rules:** the field is outside `offerClientFields`. On the emulator, both the client and the pro
  are denied writing it directly.

**`declineCandidacy({ projectId })`, the pro's לא רלוונטי**
- **Checks, in order:**
  - he's a professional on the project and not its client;
  - he's still under review (otherwise `not-under-review`; once the client has confirmed, leaving
    goes back to the request-and-approve flow);
  - his engagement is plain `hired` (otherwise `engagement-not-open`).
- **Then:**
  1. `releaseEngagement(projectId, uid, 'candidate_declined')`
  2. `closePendingPriceChanges`
  3. `maybeActivateProject`
- **No client approval,** by the same reasoning as the client's reject: this is the pre-decision
  stage.
- `rejectCandidate` now shares the same two helpers (`requirePlainHire`,
  `closePendingPriceChanges`). Its behaviour is unchanged.

**The `candidate_declined` release reason**
- **Completion:** excluded, together with `candidate_rejected`, before the ever-completed rule. A
  decline can never be what closes a project.
- **Reliability:** its own `candidateDeclines` bucket. Not counted in `withdrawn`, `byOwnChoice` or
  `byClientRemoval`.
- **Chat notice** (`releaseNotice`): "{name} החליט/ה לא להמשיך בפרויקט". Every other reason keeps
  "{name} עזב את הפרויקט", including a client rejection, whose reason is private.
- **Push to the client** for a decline only, after the release batch commits: type `system`, opens
  the chat.

**Price rule** (`decideNewPriceRequest` gains `proAccepted`), under review:
1. Something pending for this (pro, role) → `price-change-pending` (unchanged).
2. Client, or role not under review → allowed (unchanged).
3. **New:** pro, **not** acknowledged, and **no request of his own ever** for this role → allowed.
   That's his one unprompted request.
4. Otherwise the counter rule: only right after rejecting the client's latest proposal, once per
   proposal.

`createPaymentRequest` reads `proAccepted` from the same accepted offer or bundle docs it already
reads.

**What that means for the pro:**
- Before his רלוונטי: one unprompted request per role, then respond-only.
- After his רלוונטי: respond-only, even if the unprompted request was never used.
- After the client's רלוונטי: unrestricted, as before.

### Also fixed: a V1 bug in `releaseEngagement`
**The bug:** it set a released pro's accepted **price offers** to `removed`, but never touched his
accepted **bundle**. A pro hired on a bundle and then rejected (or, with item 3, declining) left a
bundle that was still `accepted` with `review: 'pending'`. So:
- he stayed on the client's review card as a ghost row;
- the project could never activate.

**Nobody hit it,** because no bundle candidate has been rejected in production.

**The fix:** accepted bundles now go to `removed` too, and `BundleOffer.status` gains `removed`.
Probe scenario 11 covers it, and **fails against the old code** (bundle left `accepted`, 1 item
still under review).

## 2. The `declineCandidacy` race (your question)
**Setup:** the pro declines while his own unprompted price request is pending, and the client
accepts that request at the same moment. Traced through the actual code of both paths; neither
runs in a transaction.

**`respondToPaymentRequest` (accept) runs:**
1. reads the request (must be `pending`)
2. `loadParty` (the pro must still be in `professionalIds`)
3. queries his `status == 'accepted'` offers for that role
4. one batch: `price` on those offers + request → `accepted`

**`declineCandidacy` runs:**
1. its checks
2. the `releaseEngagement` batch: `professionalIds` / `slotHolders` / seat removed, fee
   `withdrawn` / `not_owed` / `feeDue: 0`, offers and bundles → `removed`, notice
3. `closePendingPriceChanges`: queries `pending` requests, then a batch → `rejected`

**What can happen:**

| Order | Result |
|---|---|
| Accept fully commits before the decline starts | Offer price updated, request `accepted`. Then the decline releases normally: offer `removed` (keeping the new price), fee voided, nothing pending left to close. |
| The decline's release commits before accept reaches step 2 or 3 | Accept refuses: `professional-not-on-project` (step 2), or `No accepted offer to reprice` (step 3, since the offers are `removed`). Nothing is written. The request ends `rejected` through `closePendingPriceChanges`. |
| Accept reads steps 1–3 **before** the release commits, and `closePendingPriceChanges` queries **before** accept commits | Both write the request, and the last commit wins: it can end `accepted` or `rejected`. The accept batch still sets the new `price` on the offer docs, which are or become `removed` (the price update doesn't touch `status`). |

**In every order, nothing is charged or shown:**
- The fee is voided unconditionally (`withdrawn`, `not_owed`, `feeDue: 0`).
- The offer is `removed`, so it's outside `computeProAmount`, the card and the chip, and outside
  `isPendingReview`/activation.
- The request is no longer `pending`, so it's in no one's list.

**The only possible trace:** in the third order, the request record can say `rejected` while the
removed offer carries the proposed price. That's an inconsistent audit record with no user-facing
or money effect. **Not hardened here.** Closing it fully means running the release and the accept
in transactions that read each other's docs. Say if you want that.

## 3. Verification

**Gate:** root **921/921** (includes the functions suites). Root and functions typecheck clean.

**New and updated tests:**
- **`repricingPolicy.test.ts`** (18):
  - one unprompted request allowed;
  - used once any request of his own exists (whatever the answer);
  - a client proposal before it doesn't use it up;
  - counter rule after it;
  - history per role forever;
  - after acknowledging, counter only (even with the unprompted request unused);
  - after the client confirms, unrestricted;
  - ordering by time, for both.
- **`derive.test.ts`:** a decline never completes, and is dropped even if its own engagement once
  completed.
- **`withdrawalBuckets.test.ts`:** the `candidateDeclines` bucket.
- **`releaseNotice.test.ts`:** text for each reason.
- **`candidatesWiring.test.ts`:**
  - auth helper;
  - decline guard order and reason;
  - acknowledge never writes `review`;
  - bundles released;
  - decline-only push after commit;
  - `proAccepted` passed into the policy.
  - Its source-slicing helper was tightened so one function's body no longer runs into the next
    function's doc comment.

**Mutation check:** 13 mutations, each confirmed applied, **all caught on the first run:**
- unprompted allowed after acknowledging
- unprompted unlimited
- unprompted removed
- repricing ignoring `proAccepted`
- decline counted toward completion
- decline bucket zeroed
- decline notice generic
- bundles not released
- push on every release
- decline skipping the `hired` guard
- decline with the wrong reason
- client allowed as a candidate
- acknowledge writing `review`

**Emulator probes (functions and rules), all passing:**
- **`probe-candidate-review.mjs`** 1–6 unchanged, plus new:
  - **7. Pro acknowledges:** `proAccepted` set, review still pending, idempotent, project not
    activated. The client **and** the pro are denied writing `proAccepted` directly. The client
    still confirms and the project activates.
  - **8. Unprompted price:**
    - the pro's first Editor request is allowed, and the client is pushed;
    - after the client rejects it, a second unprompted request is refused;
    - the client proposes, the pro rejects, and the pro may counter;
    - after acknowledging, his **unused** Sound unprompted request is refused.
  - **9. Sole pro declines:**
    - with his own request pending: project **open**; he's out of `professionalIds`,
      `slotHolders` and the seat;
    - fee `withdrawn` / `candidate_declined` / `not_owed`;
    - offer `removed`; his request closed `rejected`;
    - chat notice "Beni Sound החליט/ה לא להמשיך בפרויקט";
    - the client got a `system` notification pointing at the chat;
    - declining again is refused.
  - **10. Who may call:** client → refused (both callables); a pro not on the project → refused;
    after the client confirmed → `not-under-review`, and nothing changed.
  - **11. Bundle release:** described above (fails against the old code).
- **`probe-repricing.mjs` §3:** updated for the new rule (one unprompted request, a second refused,
  refused after acknowledging). All other sections pass.
- **`probe-sole-pro-withdrawal.mjs`:** passes.

## 4. Step 3 plan, with your additions
Order: **3.1 pro card → 3.2 carousel → 3.3 instruction lines**, each committed separately.

**3.1 `CandidateProCard`**, replacing `CandidateStatusChip`
- **Before his רלוונטי:** price line; רלוונטי / לא רלוונטי / שינוי מחיר.
- **שינוי מחיר:** disabled while a request is pending. Enabled only when the client-side mirror of
  the new policy allows it.
- **רלוונטי:** `confirmDialog`, whose body adds one line warning that he **won't be able to propose
  a new price afterwards**. Then `acknowledgeCandidacy`.
- **After his רלוונטי:** no buttons; amber "ממתין להחלטת הלקוח/ה" plus a short muted note:
  "שינויי מחיר מעכשיו רק בתגובה להצעה של הלקוח/ה". The one-way door is explained, not just a
  missing button.
- **לא רלוונטי:** `confirmDialog("לעזוב את הפרויקט?", …, destructive)`, then `declineCandidacy`.
- **After the client confirms:** green chip until `in_progress`, as today.
- **Client card:** a tag "{name} אישר/ה" when the pro has acknowledged.
- **`parseSystemMessage`:** a `left` variant (person icon) for both "עזב את הפרויקט" and
  "החליט/ה לא להמשיך בפרויקט".
- `ActionButton` extracted and shared.

**3.2 Client carousel**, for 2+ pending pros
- One pro at a time, chevrons on both sides, horizontal swipe, dots.
- In Hebrew, the swipe direction and chevron order are mirrored.
- Buttons act on the shown pro; the carousel advances when that pro resolves.
- No taller than today's single row.
- Tested in both languages.

**3.3 Instruction lines** on both cards, he + en.

**Then:** a render pass with RTL carousel screenshots, one functions deploy (rules unchanged), and
a live click-through including a sole-pro decline.
