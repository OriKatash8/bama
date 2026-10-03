# A client's "confirm completion" no longer completes a disputed engagement (2026-10-03)

## Bug
`confirmCompletionInternal` closed every engagement that wasn't already finished, including a **disputed** one. It set the engagement to `completed` and charged its fee. That settled the dispute against the professional without anyone deciding it, and contradicted the comment on `completeAllEngagements`, which says a disputed engagement is "left for a human".

## Function fix (deployed: `confirmCompletion`, `completeAllEngagements`, `respondToEngagementEnd`)
- **New pure policy, `functions/src/lifecycle/confirmPolicy.ts`:** `confirmationCloses()` returns false for terminal engagements (completed, withdrawn, cancelled) and for `disputed` ones.
- **The loop uses it:** the per-pro loop in `confirmCompletionInternal` skips any engagement the policy says not to close, before writing anything for that pro.
- **Effect:** a disputed engagement stays disputed and keeps the project open (derive). Only `resolveFeeDispute` ends it.
- **Unchanged:** a professional marking their own disputed engagement done (`markEngagementComplete`). That is their own choice, and in effect withdraws the dispute.

## App fix (in this build: `project-details.tsx` `handleConfirmComplete`)
**The screen now follows the project as the server has it, re-read after the call,** through a new pure helper, `afterConfirmCompletion()` in `src/features/projects/utils/completion.ts`.

**If the project is still open** because an engagement is disputed:
- no completed badge appears, and no review flow opens
- `reviewsCompleted: false` is not written
- a toast says the other professionals are complete and one engagement is waiting for BAMA's decision. The message (`project_details.completed_except_disputed`) is in Hebrew and English.

**Before this,** the screen forced the status to "completed" and opened the review flow. The deployed review rule needs a completed project, so every review was refused, yet the project was still marked reviewed, and those reviews were lost.

## Tests
- **`functions/src/lifecycle/__tests__/confirmPolicy.test.ts`:** a disputed engagement is not closed, and derive keeps the project open.
  - The derive test includes the contrast case, all completed gives `isComplete`. Without it the first assertion could pass for the wrong reason, which it initially did.
  - A wiring check confirms the loop skips before writing.
  - Both the policy and the wiring are caught when mutated.
- **`src/features/projects/utils/__tests__/afterConfirmCompletion.test.ts`:**
  - a project that is still open goes to "disputed", whether reviewed or not
  - a completed project goes to review, or straight to done if already reviewed
  - the wiring check covers three things: the screen never forces "completed"; on "disputed" it returns before `reviewsCompleted: false` and before `setShowReviewFlow(true)`; and the already-reviewed path also decides from the server status
  - all 3 mutations are caught
- **Suites:** jest 3,021 of 3,021, script tests 70 of 70, both typechecks, and no new lint problems.

## Deploy and live check
- **First deploy attempt failed.** The machine lost network partway through (`getaddrinfo ENOTFOUND cloudfunctions.googleapis.com`), and the CLI timed out. Redeployed once the network was back, and all three functions updated successfully.
- **Live check in production, with throwaway accounts:** a client called `confirmCompletion` on a project with one `hired` engagement and one `disputed` engagement.
  - **Result:** the hired engagement became `completed`, the disputed one stayed `disputed`, and the project stayed `in_progress`.
  - **Cleanup:** everything was deleted, with zero residue.
