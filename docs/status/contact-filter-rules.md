# No phone numbers in public profile text: status before the rules deploy

Terms §6.8. As of 2026-10-01.

## Where things stand
| Checkpoint | State |
|---|---|
| 1. Detector and tests (`src/utils/contactFilter.ts`) | committed and pushed: `bfd3b47` |
| 2. App-side checks (bio and equipment inline errors, save backstop) | committed and pushed: `3665c93` |
| 3. Firestore rules | **written and verified on the emulator; not committed, not deployed** (waiting for your go) |

## Changes since the plan

### 1. Equipment cap lowered to 15 (your choice)
A request may evaluate at most **1,000 rule expressions**, and each checked list item is expensive. Measured on the emulator with a clean list:

| Items | Result |
|---|---|
| 5 to 20 | allowed |
| 25 | denied: `maximum of 1000 expressions` |

Converting the list to a single string with `string(list)` isn't supported in rules: every write, clean or not, was denied.

The cap is now 15, in both the app and the rules. The worst case is a save that changes the bio and all 15 equipment items at once, and it passes.

### 2. priceList: its items are no longer checked; instead it can't be changed
It has no editor in the app (`PriceList.tsx` isn't mounted), and the app's save just re-sends the list unchanged.

Checking its items as well pushed a full save past the 1,000-expression limit. So the rules now allow priceList only **unchanged or emptied** (`== []`). A pro can't write any new text into it.

If the editor comes back, this has to be revisited.

### 3. Uncommitted, part of checkpoint 3
- **`firestore.rules`** adds:
  - `hasPhone`, which holds the pattern verbatim (MIRROR, KEEP IN SYNC);
  - `textItemOk`;
  - `equipmentOk`, which checks positions 0–14 by hand;
  - `profileWriteOk`:
    - a key allowlist of `roleSkills`, `bio`, `equipment`, `priceList`, `proProfileCompleted`, `availability`;
    - a text field is checked **only when it changes**.
  - `profile/data` is now `create, update: … && profileWriteOk()`, and delete keeps the old condition.
- The app cap (`EQUIPMENT_MAX`) goes from 30 to 15, with its tests and the en/he limit message.
- `src/utils/__tests__/contactRulesSync.test.ts` fails if the rules pattern or the cap drifts from the app.
- `scripts/probe-contact-rules.mjs` is the emulator probe; `scripts/probe-contact-rules-prod.mjs` is the production probe (not run).
- `scripts/scan-contact-in-profiles.mjs` is the read-only production scan.

## Emulator probe: 22/22 as expected, 0 denials from the expression limit
- **Allowed:**
  - first save and re-save (the app's exact merge write);
  - availability alone;
  - availability alone when the **old** bio already has a number (unchanged field);
  - a full save that leaves an old number-bearing bio unchanged;
  - 15 equipment items;
  - the worst case above;
  - priceList emptied.
- **Denied:**
  - a bio with `052-123-4567`, `+972-52-123-4567`, `05 2 1 2 3 4 5 6 7` or `1-700-123-456`;
  - a number in the bio on first save;
  - equipment `{name}` or a plain string with a number;
  - a number in position 15;
  - 16 items;
  - new priceList text;
  - a number in a priceList service;
  - a new field (`headline`, `rating`);
  - another user writing the profile.

Test suite: 2,477 pass. `tsc`: clean.

## Existing production data (step 6: read-only scan)
- 25 profiles scanned. None has more than 15 equipment items, so the cap affects nobody today.
- **1 match:** one pro's `profile/data.bio` contains a mobile number. The user ID is left out of the repo; run the scan to see it. **Not edited.**
  - Once the new app build is out, this pro can't save their profile until they remove it.
  - The rules alone won't block them, because an unchanged bio isn't checked.
- To reproduce: `node --experimental-strip-types scripts/scan-contact-in-profiles.mjs`. It prints to the terminal only, because the output contains real numbers.

## Production probe (step F): ready, not run
- **Before the deploy it can't pass:** production still runs the old rules, which allow a number in the bio. The pre-deploy check was the emulator run above.
- **After the deploy:** `node scripts/probe-contact-rules-prod.mjs`.
  - It uses one throwaway account, marked email-verified through the Admin SDK because `profile/data` requires `verified()`.
  - It runs the spec's 4 cases, then deletes the account and its docs and confirms they're gone.

## Next step
Your go for:
1. committing checkpoint 3;
2. `firebase deploy --only firestore:rules`;
3. the production probe.

Separately, the close-project pop-up text change is also still uncommitted, and stays out of these commits.
