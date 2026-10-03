# The four pre-existing rule holes: fixed (2026-10-03)

Report: `docs/status/2026-10-03-preexisting-rule-holes.md`. The rules are deployed. The app change below ships in this build.

## Which needed app code
**Only hole 3 (reviews).** Every current app write for holes 1, 2 and 4 already fits the new rules, so those needed rules only.

## App change (ships in the build)
**Reviews are written one at a time, and the project is always marked reviewed** (`src/features/reviews/services/submitReviews.ts`).
- Before, all reviews went in one `Promise.all`. One refused review meant `reviewsCompleted` was never set, the error was swallowed, and the review modal reopened on every launch. Each retry also wrote duplicate reviews.
- Each review now gets a fixed id, `{projectId}_{professionalId}`, so a retry can't duplicate it.

**Only professionals still on the project are offered** (`src/features/reviews/utils/reviewTargets.ts`).
- The list is `filledSlots` intersected with `professionalIds`.
- Both `ReviewFlowGate` and `project-details` use it. `project-details` also re-reads the project after confirming completion, instead of using the copy it loaded when it opened.

**Tests:** `submitReviews.test.ts` and `reviewTargets.test.ts`. All 6 new behaviours are caught when mutated.

## Rules (deployed)
1. **Chat create:**
   - A client may create only a DM or a purchase chat: 2 members, the creator included, and no `ownerId`, `roles`, `readOnly`, `readOnlyReason`, `status` or `archived`.
   - For a purchase chat, the listing's seller must be a member.
   - Communities: admins only. Group chats: server only.
2. **Project create:** only in your own name (`clientId` must be the caller).
3. **Review create:**
   - The project must be the reviewer's, and completed.
   - The pro must be in the project's `professionalIds`. A legacy project without that field is accepted on owner and status alone.
4. **Listing reserve:**
   - A new buyer can reserve only through this listing's purchase chat, with both parties as members, after the seller has agreed.
   - Each party can set only its own agreement flag: the seller `sellerAgreed`, the buyer `buyerAgreed`.

**Cost:** at most 1 extra read on each of these writes.

## Verification
- **New probe (`scripts/probe-rule-holes.mjs`):** 34 of 34 pass. Every app write is still allowed, including both agreement orders and the admin community create, and every abuse case is denied.
  - All 15 new rule clauses are caught when removed.
  - Two of them were only caught after I added an isolating case: a reserve that writes only the listing, and a 2-member group chat.
- **Existing probes:** demo isolation 164 of 164, email-verified 25 of 25, and admin-chat, chats, contact, invite, join-request, mentions, reply and phone all pass.
  - The marketplace, offer and fee-overdue probes give identical output under the old and new rules.
  - 3 probes had to be updated. Each was testing something the fix now refuses: a project in another user's name, a client-created group chat, and a review with no project.
- **Production:** the normal-user check passes 43 of 43, both before and after the deploy, with nothing left behind.
- **Suites:** jest 3,011 of 3,011 and the script tests 70 of 70 pass. Both projects typecheck, and lint shows nothing new.

## Not fixed (reported only)
- `confirmCompletionInternal` also completes a `disputed` engagement (`completion.ts:136,181`). That contradicts the comment at `:759`.
- When the buyer presses agree second, `acceptDeal` searches for the seller's other open purchase chats using the buyer's uid, so those chats are not archived (`marketplaceService.ts:102-110`).
