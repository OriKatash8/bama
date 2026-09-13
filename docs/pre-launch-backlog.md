# Pre-launch backlog

Known defects and deferred decisions, kept here rather than in a commit message
so they stay findable. Each entry says what is wrong, why it was not fixed at the
time, and what a fix has to decide.

## 1. The contest-resolution trap — BLOCKING

A contested engagement holds its capacity slot deliberately (releasing it would
make contesting a way to buy capacity). **Nothing can resolve it**, so the slot
is held forever and the project never completes:

- **`amount_disputed`** → admin calls `markFeePaid` → `settleFee` writes the fee
  but explicitly nothing to the project (`completion.ts:497`, "slots are
  completion's") and never touches `engagementStatus`. The uid stays in
  `slotHolders`.
- **`didnt_happen`** → `settleFee` throws `nothing-owed` on `status: 'not_owed'`
  (`completion.ts:457`). There is no callable at all.
- The trap is circular: `applyDerivedProjectState` clears `slotHolders` only when
  the project derives complete (`derive.ts:184`), which a `disputed` engagement
  prevents.

Traced in `functions/src/lifecycle/__tests__/contestResolution.test.ts`.

**The fix must NOT be in `settleFee`** — that would make paying free capacity,
the coupling the compliance reversal removed and what Guideline 3.1.1 turns on.
It needs a `resolveContest({ projectId, professionalId, outcome })` admin callable
putting the engagement into a TERMINAL status; the existing derivation then frees
the slot with no new bookkeeping.

Undecided, and why it was not built: `didnt_happen` upheld has no correct terminal
status (`cancelled` means the project ended, `withdrawn` means the pro left —
neither is "this engagement never happened", so it may need a fifth value);
`didnt_happen` rejected has to RESTORE a fee that was zeroed; `amount_disputed`
resolved needs someone to decide the number; and it is unsettled whether
resolution reopens the charge window for a pro who spent theirs contesting.

## 2. The admin flagged queue is blind

`adminListFlaggedProjects` (`adminViews.ts:152`) reads project-level
`p.adminReview` for reason, professional and timestamp. Every `adminReview` writer
now writes to the ENGAGEMENT (`completion.ts:343/613/737/912`, `cron.ts:103`), and
`applyDerivedProjectState` rolls up only the boolean. So a flagged row shows
`reason: ''`, `proId: null`, `flaggedAt: null` — the admin sees a project title,
cannot tell which professional contested or why, and every post-Phase-2 flag sorts
to the bottom under `flaggedAt ?? 0`.

Wants fixing together with item 1: the queue is how a resolution gets triggered.

## 3. Two enums for one lifecycle

`ProjectFee.status` (`FeeSettlementStatus`) and `ProjectFee.engagementStatus` both
describe where an engagement stands. Same shape as the `slotActive` /
`slotHolders` duplication — a derived twin beside its source, with nothing saying
which wins. Phase 5 reads `engagementStatus` in the code it added and left
existing readers alone.

One consequence is live: `feeBlocksNewHire` (`pricing.ts`) exempts
`status === 'disputed'`, and **nothing ever sets that** — both contest paths set
`engagementStatus: 'disputed'`. The only thing that ever produced it was a
client-side optimistic write, removed in Phase 5 Step 3. So contesting the amount
does not pause the arrears clock: the professional is blocked from new hires over
a number an admin is still deciding.

## 4. The ledger disagreed with the lifecycle — visible in data, same defect as 3

Three engagements recorded a payment while their `engagementStatus` was not
terminal. Legitimate as §5 early payment, but it means the money record and the
lifecycle record disagreed, and with the projects now deleted there is no way to
re-derive which was right.

Preserved in `~/bama-backups/fee-ledger-bama-af0a0-2026-09-13T02-56-34-157Z.json`:

- `projects/WeiHb05DRzgpIbMQZzRA/fees/LfeGzYPo8QMTRcxGAVtNNQ3bXPv1`
  — `paidAmount: 12`, `baseAmount: 400`, `engagementStatus: 'hired'`, no `status`
- `projects/nfoP1QLjfUXDKIBkVBTP/fees/LfeGzYPo8QMTRcxGAVtNNQ3bXPv1`
  — `paidAmount: 4`, `baseAmount: 123`, `engagementStatus: 'hired'`, no `status`

and a third, `status: 'paid'` against a non-terminal engagement:

- `projects/0303HZKlgCCyVlG7MLVC/fees/LfeGzYPo8QMTRcxGAVtNNQ3bXPv1`
  — `paidAmount: 37`, `baseAmount: 1234`, `engagementStatus: 'end_requested_by_pro'`

Whatever collapses item 3 has to decide what an early payment means for
`engagementStatus`, and these are the real shapes it must account for.

## 5. One relationship, two fields, no declared owner — project ↔ chat

`chat.projectId` and `project.chatId` both describe the same link, and nothing
says which is authoritative. Same shape as item 3 and as
`slotActive`/`slotHolders`: a duplicated fact with no owner.

Caught by the 2026-09-13 wipe, which followed `project.chatId` only. Three group
chats survived it — `IVC1nsvxw02u0R8aKg2c`, `qTPHwFdLzsPwu8q7Mq5f`,
`twfUQ1WnltLCHnb2fAuI` — each carrying a `projectId` for a project that was
already deleted, because their projects had no back-reference. They were found
only because the follow-up survey counted the `chats` collection instead of
trusting the wipe's own "42 of 42 referenced" figure, which counted reachability
rather than existence.

The next cascade misses the same way. A fix has to pick one direction as the
truth and derive or drop the other.

## 6. `deleteProject`'s cascade is incomplete — the general form of item 5

`functions/src/lifecycle/deletion.ts` deletes `priceOffers`, `bundleOffers`,
`fees`, the chat document and the project. It does NOT delete:

- `reviews` carrying the projectId;
- `projectApplications` carrying it (a collection the cascade never knew about);
- `notifications` whose `data.projectId` points at it;
- the chat's `messages` — Firestore subcollections do not die with their parent;
- four of the five project subcollections: `meetings`, `missions`,
  `paymentRequests`, `removalRequests`.

Every un-hired project deleted through the app has been leaving residue. The
2026-09-13 sweep measured it: 13 priceOffers, 3 bundleOffers, 2
projectApplications and 102 notifications were already orphaned before that wipe
ran, from projects deleted in earlier sessions.

`scripts/wipe-projects.mjs` covers all of it and uses `recursiveDelete`; the
callable should be brought up to the same coverage rather than the script staying
the only complete path.

## 7. `communities` has no rule at all

Live with 1 document ("צלמי sony", a different shape from the community chats:
`status`, `members`, `ownerId`, no subcollections) and absent from
`firestore.rules`, so default-deny makes it unreachable from any client. The app's
discovery reads `chats where type == 'community'` instead — a community IS a chat
document, and this collection appears to be an earlier representation.

Either the document is vestigial and should go, or the collection is real and
needs a rule. It cannot be both, and right now it is data no code can reach.

## 8. A dead `subscriptions` rule

Declared in `firestore.rules` with no code and no data — the subscription feature
was removed in the compliance reversal. A rule granting access to a collection
nothing writes is attack surface with no purpose.

## 9. Deploy drift — CLOSED by `scripts/check-deploy-drift.mjs`

Kept as the record of why the check exists.

On 2026-09-13 a client could not edit a project deadline:
`Missing or insufficient permissions`. `firestore.rules` had carried `endDate` in
`clientProjectFields()` since `952f5d6` and had never been deployed — the live
ruleset was `d881c201`, created 2026-09-10T11:41:21Z, three days and two commits
behind.

The permissions error was the cheap part. The same stale ruleset was also missing
`hasOpenEngagement()` and `canWriteProjectSubdoc()`, so `meetings` and `missions`
writes were still gated on `isProjectParticipant` — and chat membership never
expires. Every professional whose engagement had completed or who had withdrawn
retained write access to missions and meetings on finished work, for three days,
with nothing surfacing it.

THREE DEPLOY SURFACES, THREE SEPARATE COMMANDS, and only the functions list was
ever spot-checked. Rules and indexes had no check at all, and a green
`firebase deploy` message is not evidence a release moved — it says the upload
succeeded, not that what is live matches the file.

`scripts/check-deploy-drift.mjs --project bama-af0a0` now fetches all three and
compares: the deployed ruleset source byte-for-byte, composite indexes as a set of
(collectionGroup, fields) since the API assigns its own names and order, and every
`export const <name> = onCall/onSchedule/onDocument...` in `functions/src` against
the deployed function list. Exits non-zero on drift so it can gate a release.
Verified by injecting drift on each surface in turn.

Run it before any release, and after any deploy.

## 10. Smaller, previously noted

- The INTERIM `paymentRequests` rule, and `repricing.ts:200`'s `< 0` vs `<= 0`.
- Raise `MIN_OFFER_PRICE` above the commission floor so the 600% case is
  unreachable.
- `confirmCompletion` and `completeAllEngagements` are byte-identical — same
  guard, same `confirmCompletionInternal(projectId, 'client')`. One should go.
- `expectedEndDate` is superseded by `endDate` for everything new. It was kept
  because the legacy projects had no `endDate`; that population is now empty, so
  it is removable once nothing reads it.
