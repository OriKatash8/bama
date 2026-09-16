# Candidate review card — Phase 1 report (investigation only)

## Context
Joining a project group chat is the same as being hired today: one callable writes the
chat membership, the slot, and the fee/engagement record together. The goal is a
pre-decision stage inside that same chat. The client talks to candidate pros, then marks
each one רלוונטי / לא רלוונטי / שינוי מחיר. The project goes active only once every
candidate is resolved. This file is the Phase 1 report. No code was changed. Phase 2 has **not** started and is
waiting for explicit confirmation.

---

## 1. Project group chat creation

**Who creates it:** only the Cloud Function callable `hireProfessional`
(`functions/src/lifecycle/hire.ts:378`). The client never writes it. It is called from
`src/features/offers/hooks/useAcceptOffer.ts:22` and `useAcceptBundleOffer.ts:21`
(Accept on the client's Offers tab, `src/app/(client)/(tabs)/projects/index.tsx:212-246`).

**Order of the call:**
1. Load the offer or bundle. An already-accepted offer returns the existing chatId.
2. `loadAndEnforce` (`hire.ts:40-140`) checks:
   - the caller is the client
   - it isn't a self-hire
   - `canHireOnStatus` (open or in_progress)
   - `readConfig()`
   - reads the existing fee doc
   - **slot cap**
   - fee arrears
3. `prepareOffer` / `prepareBundle` query competing offers. This runs outside the transaction.
4. `commitHire` → `db.runTransaction` (`hire.ts:183`) writes:

| Target | Written |
|---|---|
| The accepted offer | `status: 'accepted'` |
| Competing offers | Pending offers in the **same project + category**, and this pro's pending bundles, become `rejected` (`hire.ts:318-327`, `364-369`) |
| `projects/{id}` | `filledSlots` (read then rewritten), `professionalIds: arrayUnion`, **`slotHolders: arrayUnion(proId)`**, `slotActive: true`. First hire also writes `chatId` and `expectedEndDate`. **Status is never changed** (`hire.ts:204-236`) |
| `chats/{auto}` (first hire) | `{type:'group', name, projectId, members:[clientId, proId], roles:{client:'admin'}, lastMessage:null, createdAt}` (`hire.ts:216-226`) |
| `chats/{chatId}` (later hires) | `members: arrayUnion(proId)` (`hire.ts:234`) |
| `projects/{id}/fees/{proId}` | Every hire writes `baseAmount: increment(price)`, **`engagementStatus: 'hired'`**, `slotActive`, `completionDueAt`. The pro's first hire on the project also writes **`feeRate`**, **`minFeeApplied`**, `feeStatus:'owed'`, `status:'pending'`, `hiredAt` (`hire.ts:241-283`) |

- Hiring writes no system chat message. The only side effect is the `onPriceOfferAccepted`
  notification to the pro (`functions/src/notifications/triggers.ts:207-235`).
- After the transaction, `applyDerivedProjectState` runs (`hire.ts:295`).

**`hired` status:** it exists only on the fee doc (`engagementStatus`, `hire.ts:251`). There is
no participant record anywhere.

**Slot cap:** enforced only on the server (`hire.ts:82-108`). It counts
`projects where slotHolders array-contains proId`, capped by `config/pricing.maxOpenProjects`
(default 2, `functions/src/pricing.ts:22`). A pro who is already in this project's
`slotHolders` skips the check (`hireConsumesNewSlot`, `pricing.ts:126`).
- **Race:** the cap check runs before the transaction. Two hires of one pro onto two different
  projects at the same moment can both pass.
- **Client mirror:** `listenToSlotUsage` (`src/features/pricing/services/slotsService.ts:31`).
- **What frees a slot:**
  - completion (`completion.ts:248, 838`)
  - derived complete (`derive.ts:183`)
  - cancel (`completion.ts:374`)
  - `releaseEngagement` (`removal.ts:86-93`)
  - the 45-day archive cron

**Fee rate lock:** set on the fee doc at the pro's **first hire on that project**
(`hire.ts:258-270`: `feeRate = config.feePercent/100`, `minFeeApplied = config.minFeeAmount`).
Nothing writes it again. The rate is locked per pro at join time, not once per chat.

---

## 2. Noticeboard price offers — and the reuse question

**How offers work today:**
- The pro writes top-level docs directly from the app, with no callable: `priceOffers/{autoId}` and
  `bundleOffers/{autoId}` (`src/features/noticeboard/hooks/usePriceOffer.ts:12-74`).
- `PriceOffer` fields: `projectId, professionalId, category, price, status: pending|accepted|rejected|removed,
  bundleId?, editedAt?, editCount?` (`src/core/types/project.ts:338-351`).
- **Rules** (`firestore.rules:582-620`):
  - **Create:** only the pro, as `professionalId == uid`, with status pending and a price of 1–50000.
  - **Read:** the pro and the project client.
  - **Update:** either party. The pro may edit `price`; the client may set status pending → rejected.
    Price is frozen once accepted.
- **Triggers:** `onNewPriceOffer` notifies the client. `onPriceOfferAccepted` notifies the pro.

**A counter-offer system already exists, and it is not `priceOffers`.**
`projects/{id}/paymentRequests` does this job:
- `PaymentRequest {fromUserId, toUserId, professionalId, bundleId?, category?, currentAmount,
  proposedAmount, note?, status: pending|accepted|rejected}` (`src/core/types/project.ts:415-433`)
- The callable `createPaymentRequest` (`functions/src/lifecycle/repricing.ts:48-129`):
  - works in either direction (client→pro or pro→client)
  - reads `currentAmount` from the accepted offer
  - posts a `💰` system message into the group chat
- The callable `respondToPaymentRequest` (`repricing.ts:149-237`): only the recipient can answer.
  On accept it writes the new `price` onto the accepted offer.
- Existing UI in `project-details.tsx:584-650, 1174+`. The system message renders as the
  `price_change` pill in `ChatRoomScreen.tsx:131-171`.
- Rules: read only by `fromUserId` / `toUserId`, update `false` (`firestore.rules:522-544`).

**Recommendation: reuse `paymentRequests` for שינוי מחיר. Don't add `direction` to
`priceOffers`.**
- **Direction is already there.** It is `fromUserId` / `toUserId`.
- **Its precondition already holds in the chat.** It requires an *accepted* offer, and today a
  pro only enters the chat once their offer is accepted.
- **Accepting writes to the right place.** Accept updates `offer.price`, which is exactly what
  completion reads (`computeProAmount`, `helpers.ts:177-199`). A second price store would
  drift from it.
- **`priceOffers` can't carry a client-authored offer.**
  - The create rule requires the pro as author.
  - Both triggers assume the pro wrote it.
  - Only the client can accept it (`hire.ts:44`).
  - The client can already silently overwrite a pending price under the current rules, with no
    record of who changed it.

**Gaps in `paymentRequests` that Phase 2 must close:**
- No 1–50000 range check (`repricing.ts:53, 201`).
- No "one counter back" limit.
- No push notification, only the chat message.
- The create rule is still open to direct client writes ("INTERIM").
- `priceHistory[]` becomes the list of paymentRequests for that pro, so it isn't needed as a
  separate field.

---

## 3. Chat screen structure

**Files:**
- Screen: `src/features/chat/screens/ChatRoomScreen.tsx`.
- Routes: `src/app/(client)/(tabs)/chats/[chatId].tsx`. The professional route only re-exports it,
  so both roles render the same screen.

**Header:** written inline at `ChatRoomScreen.tsx:1158-1225`. For group chats, tapping the
title opens project-details.

**Layout** (`:1150-1620`):
1. header
2. community channel bar
3. **`PurchaseBanner` slot** (`:1266-1270`)
4. `<View flex:1>` holding a non-inverted `FlatList` (`:1280`)
5. bottom bars
6. input

**Where the card goes:** any sibling placed between the header and the `flex:1` list view stays
fixed. That is exactly where `PurchaseBanner` already sits. The candidate card goes in the same
slot.

**Existing banner patterns:**
- `PurchaseBanner` (`src/features/marketplace/components/PurchaseBanner.tsx`) decides whether to
  show itself, listens to its own data, and returns `null` when it doesn't apply. It is the
  template to copy.
- Read-only and archived bottom bars at `:1495-1545`.

**Client vs pro view:** decided by id on the project, never by mode.
- `ChatRoomScreen.tsx:513-515, 867` keeps `projectClientId` and compares it to the current user.
- `project-details.tsx:1013` has `isClient = currentUserId === project.clientId`.
- `activeMode` is used only for navigation.

---

## 4. Participants and permissions

**Where participants live:** `chats/{id}.members: string[]` is the only list
(`src/features/chat/types.ts:37`). `roles` is set but never used for access.

**Removing a pro:** `releaseEngagement` (`functions/src/lifecycle/removal.ts:51-166`), reached from
the `freeSlot` callable and from an accepted withdrawal, does all of this in one batch:
- filters `filledSlots`
- `arrayRemove` on `professionalIds` and `slotHolders`
- fee doc → `engagementStatus: 'withdrawn'`, `status: 'not_owed'`, `feeDue: 0`
- accepted offers → `removed`
- posts **`${proName} עזב את הפרויקט`** as a system message
- `members: arrayRemove`

It is almost exactly the לא רלוונטי path.

**Revoking write while keeping read: not possible today.**
- Message read and create both check `uid in chatMembers(chatId)` (`firestore.rules:354-359`).
- The only write block is `readOnly`, which applies to the whole chat.
- A removed pro loses read access entirely, and the screen redirects on permission-denied
  (`ChatRoomScreen.tsx:718-724`).
- The pro's past messages **stay visible to everyone still in the chat**, since messages are
  never deleted.
- To let the pro still read the chat after rejection, Phase 2 would need:
  - a new `formerMembers` array on the chat
  - rules: read = members ∪ formerMembers, create = members only
  - a change to the chat-list query, which today is `members array-contains`

A per-user write gate already exists for a different path: `hasOpenEngagement` /
`canWriteProjectSubdoc` (`firestore.rules:206-218`) for missions and meetings. Its shape could be
copied.

---

## 5. Reuse check

| Piece | What exists | Use |
|---|---|---|
| Project status | `'open' \| 'in_progress' \| 'completed' \| 'cancelled'` (`types/project.ts:70`). **Nothing ever writes `in_progress`.** Labels and badges for it already exist. | Use `in_progress` as "active". Don't add `'active'`. |
| System messages | `{senderId:'system', system:true}`, written by functions and rendered by `parseSystemMessage` from emoji/phrase (`ChatRoomScreen.tsx:154-182`). "עזב את הפרויקט" already exists. | Reuse. Final-crew message = a new emoji branch. |
| Private message to pro | `sendBamaSystemDM` (`functions/src/system/index.ts`), a read-only DM from BAMA | Rejection reason |
| Engagement lifecycle | Fee doc `engagementStatus: hired \| end_requested_by_pro \| completed \| withdrawn \| disputed \| cancelled` + `derive.ts` | Candidate stage sits **before** `hired` |
| Release | `releaseEngagement` (`removal.ts`) | לא רלוונטי / expired |
| Scheduled job | One daily cron, `lifecycleCron` at 03:00 (`functions/src/lifecycle/cron.ts`) | Too coarse for a 72h TTL |
| Config | `config/pricing` doc, read through `readConfig()` / `resolveConfig` (`functions/src/pricing.ts:155-211`), with the client mirror `usePricingConfig` | Add `candidateInviteTtlHours: 72` |
| Restricted-read docs | `removalRequests/{proId}` (client + that pro), `fees` (pro only) | Pattern for the candidate doc |

---

## Conflicts between the proposed model and the code

1. **There is no "project participant record" to put status on, and neither obvious place is safe.**
   - `projects/{id}` is readable by **every signed-in user** (`firestore.rules:478`).
   - The chat doc is readable by all members.
   - The fee doc is readable by the pro only; the client is explicitly denied.
   - → A new doc is needed: `projects/{id}/candidates/{proId}`.
     - Read: client, plus that pro (for his own chip and price).
     - Write: Admin SDK only.
     - Read keyed on the `professionalId` **field**, not the wildcard, or collection queries fail.
       Same lesson as the `fees` rule.

2. **Fee rate lock and fee row are one document today.**
   - The rate is written onto the fee doc at join.
   - If the fee row is only written at רלוונטי, the snapshot needs a home in between.
   - → Store `feeRate` + `minFeeApplied` on the candidate doc at join, and copy them into the fee
     row at confirm.
   - Decided: it is locked per pro, at *their* join.

3. **Writing the fee row at רלוונטי changes what candidates can do**, because a lot of code keys
   off the fee doc:
   - `derive.ts` counts engagements from fees. A project whose pros are all candidates reads as
     "no engagements", which is fine.
   - A missing fee doc is read as **exempt** (`ChatsScreen`, balance utils), so candidates show no
     fee copy. That is correct.
   - End/complete/contest callables require a fee doc, so candidates can't use them. Correct.
   - `completionDueAt` auto-complete (cron sweep 5) won't touch candidates. Correct.
   - `hasOpenEngagement` needs a fee doc, so **candidates can't write missions or meetings**.
     `isProjectParticipant` still lets them *read* them, because they are chat members.

4. **Slots: consistent, with one addition needed.**
   - Join already does `slotHolders: arrayUnion`, so the slot is consumed at join as decided.
   - Rejection and expiry must reuse `releaseEngagement` (it arrayRemoves `slotHolders` and
     `filledSlots`), with a fee-doc-less branch.
   - `derive.ts:183` empties `slotHolders` only when the project is complete, which can't happen
     while candidates are pending.
   - The pre-existing cap race (check outside the transaction) is unchanged.

5. **Accept rejects every competing offer in the same category at join** (`hire.ts:318-327`).
   - So the client can only ever have **one candidate per role** in the chat.
   - If they reject that candidate, the other bids for that role are already `rejected` and
     cannot be revived.
   - Decided: rival bids stay pending until the category's last seat is confirmed. See R1–R5.

6. **The counter-offer must write back to `priceOffers.price`, not only to `currentPrice`.**
   - Completion recomputes `baseAmount` from accepted offers (`computeProAmount`).
   - Reusing `paymentRequests` does this already. A separate `currentPrice` field would be a
     second, drifting copy.
   - → On the candidate doc, keep `status` + timestamps and **derive** the price from the offer.

7. **Status names.** `'priceOffered'` works. `'active'` should map to the existing `in_progress`.
   - The client update rule lets a client change project `status`, blocking only `completed` and
     `cancelled` (`firestore.rules:151-155`).
   - It must also block `in_progress`, or the client can skip the gate.

8. **TTL.** The daily cron would expire a 72h invite anywhere from 72h to 96h.
   - Options: an hourly `onSchedule` sweep over `candidates where status in [pending, priceOffered]
     and expiresAt < now`, or tighten to "whenever someone next acts". I recommend the hourly
     sweep.
   - A collection-group query needs a new index.

9. **Legacy.** Pros already hired have no candidate doc. Treat **a missing candidate doc as
   `confirmed`**, the same "absent means settled" convention the fee code uses. No migration.

10. **Rejected pro's access.** "Keep his past messages" is already true for everyone else in the
    chat. Keeping the chat *readable for him* needs `formerMembers` plus rules and chat-list
    changes. Decided: the rejected pro is removed from the chat completely, so no `formerMembers`.

---

## Round 2: your decisions and what the code says about them

**Your decisions:**
- Rival bids stay pending until someone is confirmed.
- The fee rate is locked per pro, at the moment they join.
- A rejected pro is removed from the chat completely.
- After לא רלוונטי or expiry, the role's other bids stay pending and can be invited again right away.
- The rejected pro's own bid is not restored. He is out unless the client re-invites him directly.
- The fallback list checks each bidder's slot availability live.
- Rival bids for a role are rejected only when someone for that role is marked רלוונטי. Never on
  join, and never touching other roles.

**Round 2 answers:**
- **D:** rival bids are rejected only when the **last** seat of the category is confirmed.
- **E:** a pending bundle whose role fills up is **rejected as a whole**.
- **F:** re-invite lives on the **Offers tab**, in a collapsed "Released" section per project, with
  the same availability check as pending bids.
- **Still open:** should a pro who withdrew on his own be re-invitable too? Default: yes.

### R1. Where rival bids are rejected today, and what has to move

**Today, at join:**
- **Single offer** (`prepareOffer`, `hire.ts:301-329`): pending offers in the same project and
  category are rejected. So is **every pending bundle from this same pro** on the project, whatever
  roles it covers.
- **Bundle** (`prepareBundle`, `hire.ts:331-371`): pending offers in each of the bundle's
  categories are rejected, plus every other pending bundle that overlaps any of those categories.

**Change:** all of these move from join to confirm. At join, only the invited offer or bundle
changes: `pending → accepted`.
- The "accepted" state already makes `paymentRequests` work (see §2), so it is still the right
  status for a candidate.
- The candidate doc is what tells a candidate apart from a confirmed hire.

### R2. Blocker: nothing on the server checks that a role still has an open seat

- `hireProfessional` never calls `getVacantSlots`. The server copy exists
  (`functions/src/matching.ts:53`), but `hire.ts` only uses `assignFilledCapability`.
- Today this is hidden because join rejects every rival bid, so no second Accept button is left.
- Once rival bids stay pending, the client **could invite a second pro into a one-seat role**.
- → Phase 2 must add a seat check **inside the transaction**, against the fresh `filledSlots`.
  Join already appends `filledSlots`, so a candidate holds the seat.
- → The client Offers list must show those bids as **"role taken by a candidate"** (disabled).
  They re-enable live when the candidate is rejected or expires. That needs a listener on the
  project doc, not just the offers.

### R3. Roles can have more than one seat

- `crewSlots[].quantity` can be above 1 (`matching.ts:42-52`).
- With 2 camera seats, confirming the first camera pro must **not** reject the other camera bids,
  because the second seat is still open.
- → Decided (D): rival bids are rejected when the role's **last** seat is confirmed.

### R4. Seats are split by capability, but offers aren't

- A seat is (category + `requiredCapability`), e.g. a drone camera seat and a general camera seat.
- `PriceOffer` has no capability field. This is the known limit in
  `src/features/noticeboard/unoffered.ts:16-23`.
- So "rival bids for that role" can only be matched **per category**.
- On a project with both a drone seat and a general seat in one category, confirming the last
  drone seat would also reject bids that were really aimed at the general seat.
- → Phase 2 rule: reject rival bids only when **every seat in that category** is confirmed. That is
  safe with no schema change. Adding capability to offers is out of scope.

### R5. Bundles and "never touching other roles"

- A bundle has one price for several roles and can't be split.
- Take a pending bundle covering role A and role B. If A's last seat is confirmed, the bundle can
  never be fully honoured. Rejecting it also withdraws that pro's bid for B.
- → Decided (E): reject the whole bundle. B loses that bid.

### R6. The rejected pro's bid, and re-inviting him

**What rejection does today:** `releaseEngagement` sets the pro's accepted offers to `'removed'`
(`removal.ts:150`). That already meets "not restored to pending":
- the client list only shows `pending` (`usePriceOffers.ts:39`);
- the pro can't re-bid, because `offeredCategoriesByProject` counts bids of every status,
  including removed (`unoffered.ts:26-31`).

**The gap:** there is **no path for the client to re-invite him**. `hireProfessional` refuses any
offer that isn't `pending` (`hire.ts:397`).
- → A re-invite path is needed. Recommended: `hireProfessional` accepts a `removed` offer **only
  when the client passes `reinvite: true`**. It still runs every normal check (seat, slot cap,
  arrears, price range). Decided (F): the button lives in a "Released" section on the Offers tab.
- → A pro can also leave on his own (withdraw) through the same `releaseEngagement`, and also ends
  up `removed`. Both cases would become re-invitable. Say if a pro who withdrew should be excluded.

**Wording:** the list where the client accepts bids is the **Offers tab**
(`src/app/(client)/(tabs)/projects/index.tsx`). The "noticeboard" is the pro's screen for finding
projects. Rival bids become invitable again on the Offers tab.
- For pros: when a candidate is released, `filledSlots` shrinks and the role **reappears on the
  noticeboard** for pros who haven't bid on it (`getVacantSlots`). That happens with no extra work.

### R7. Live slot availability in the fallback list

**It has to be a callable, not a client-side query:**
- **Rule §6** (comments at `projects/index.tsx:186-205`, `hire.ts:131-135`): the client must never
  learn a pro's slot usage or that he owes BAMA money. Both refusals already collapse into one
  neutral line, `hire_unavailable_error`.
- **Arrears can't be computed on the client.** Fee docs are readable by the pro only
  (`firestore.rules:551-558`).
- Slot usage *could* technically be queried by the client (`projects` is readable by any signed-in
  user, the same query as `slotsService.ts:38`). That would break §6 and still miss arrears.

**Recommended:** a new callable `checkBidderAvailability({ projectId })`.
- It returns `{ [offerOrBundleId]: boolean }` and nothing else, no reason.
- It reuses the checks `loadAndEnforce` already runs:
  - `hireConsumesNewSlot` + the `slotHolders` cap query
  - `feeBlocksNewHire`
  - the seat check from R2
- It is called when the Offers tab gets focus and again right before Invite. Invite itself keeps
  enforcing everything, because availability can change between the two calls.
- A pro who already holds a slot on this project, as a candidate or hire for another role, doesn't
  use a new slot (`hireConsumesNewSlot`), so he still shows as available.

**Slot count:** the cap is `config/pricing.maxOpenProjects`, **default 2** (`pricing.ts:22`). You
mentioned 3 slots, so check the live config doc. Candidates count toward the cap because join
already adds them to `slotHolders`.

### R8. The pre-existing race gets worse

- The slot-cap check runs **before** the transaction (`hire.ts:100-107`).
- With more bids kept invitable, "the same pro invited onto two projects at once" happens more
  easily.
- → Phase 2 should move the cap check inside the transaction.
- Firestore transactions can't run queries, so the fix is either a per-pro counter doc
  (`users/{uid}/slots`) or re-checking after commit. Recommended: counter doc.

## Security rules that would block client-only card data
- `projects/{id}` is public to signed-in users, so candidate data **must not** go there.
- The chat doc is member-readable, so it **must not** go there either.
- Any new subcollection is denied by the catch-all (`firestore.rules:879-881`) until a rule is
  added. That's good: rules for `candidates` need to be written explicitly.
- `paymentRequests` read is from/to only, so other pros never see a counter-offer. Already correct.
- The card itself is UI. Hiding it from pros is a render condition
  (`currentUserId === projectClientId`), and the data behind it is protected by the rule above.

---

## Phase 2 file list (expected)

**Server**
- `functions/src/lifecycle/hire.ts`:
  - Join writes the candidate doc: status pending, invitedAt, expiresAt, feeRate/minFee snapshot.
    It **no longer** writes the fee doc.
  - `prepareOffer`/`prepareBundle` reject nothing at join (R1).
  - Seat check inside the transaction (R2).
  - `reinvite` path for `removed` offers (R6).
  - Slot-cap check moved inside the transaction via a counter doc (R8).
- `functions/src/lifecycle/candidates.ts` (new):
  - callables `confirmCandidate` and `rejectCandidate`
  - the "all resolved → in_progress + crew message" check
  - `checkBidderAvailability` (R7), sharing checks pulled out of `loadAndEnforce`
  - rival-bid rejection on the last seat of a category (R3/R4/R5)
- `functions/src/matching.ts`: reuse `getVacantSlots` on the server.
- `functions/src/lifecycle/removal.ts`: `releaseEngagement` tolerates a missing fee doc.
- `functions/src/lifecycle/repricing.ts`: range check, one counter back, candidate status
  priceOffered ↔ pending.
- `functions/src/lifecycle/cron.ts` or a new hourly schedule: expiry sweep.
- `functions/src/pricing.ts` + `functions/src/lifecycle/config.ts`: `candidateInviteTtlHours`.
- `functions/src/lifecycle/helpers.ts`: `CandidateDoc` type and path helper.
- `functions/src/index.ts`: exports.
- `functions/src/__tests__/…`: tests for each callable and the sweep.

**Rules / indexes**
- `firestore.rules`:
  - `projects/{id}/candidates` read rule
  - block client `status → in_progress`
  - close the interim `paymentRequests` create
- `firestore.indexes.json`: collection-group index for the expiry sweep.

**App**
- `src/core/types/project.ts`: `ProjectCandidate` type.
- `src/features/chat/services/candidateService.ts` (new): listeners and callable wrappers.
- `src/features/chat/components/CandidateReviewCard.tsx` (new): client-only, in the
  PurchaseBanner slot.
- `src/features/chat/components/CandidateStatusChip.tsx` (new): pro's own chip and price line.
- `src/features/chat/screens/ChatRoomScreen.tsx`: mount both; add final-crew and
  price-offer branches to `parseSystemMessage`.
- `src/features/chat/services/paymentService.ts`: reuse for שינוי מחיר.
- `src/core/constants/pricing.ts` / `src/features/pricing/utils/config.ts`: TTL mirror.
- `src/core/i18n/translations/{en,he}.json`.
- `src/app/(client)/(tabs)/projects/index.tsx`, `useAcceptOffer`, `useAcceptBundleOffer`,
  `PriceOfferCard`:
  - Accept becomes Invite.
  - "Role taken by a candidate" disabled state, re-enabled live (R2).
  - Neutral "unavailable" state from `checkBidderAvailability` (R7).
  - Re-invite for removed bidders (R6).
- `src/features/offers/hooks/usePriceOffers.ts` / `useBundleOffers.ts`: project listener for seat
  state.
- Tests beside each.

## Verification (Phase 2)
- Functions unit tests for each transition:
  - join
  - confirm (fee row written, rate = snapshot, not current config)
  - reject (slot freed, removed from members, system message, bid → removed)
  - counter (confirm disabled while priceOffered)
  - expiry
  - all-resolved → in_progress
- Rules tests on the emulator:
  - another pro can't read `candidates`
  - client can't set `in_progress`
  - rejected pro can't post
- App tests: card is client-only, chip is pro-only, confirm is disabled while priceOffered.
  Mutation-check each anchor.
- Browser pass on web with a client and a pro account.
