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

## 5. Smaller, previously noted

- The INTERIM `paymentRequests` rule, and `repricing.ts:200`'s `< 0` vs `<= 0`.
- Raise `MIN_OFFER_PRICE` above the commission floor so the 600% case is
  unreachable.
- `confirmCompletion` and `completeAllEngagements` are byte-identical — same
  guard, same `confirmCompletionInternal(projectId, 'client')`. One should go.
- `expectedEndDate` is superseded by `endDate` for everything new. It was kept
  because the legacy projects had no `endDate`; that population is now empty, so
  it is removable once nothing reads it.
