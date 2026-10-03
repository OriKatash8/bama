# Pre-launch production wipe: Phase 2 (done)

Date: 2026-10-03. Plan and inventory: `docs/status/2026-10-03-prelaunch-wipe-phase1.md`.
Script: `scripts/wipe-prelaunch.mjs`, with its keep rules in `scripts/lib/wipeClassifier.mjs`.

## Result
- **Auth: 5 users left.** These are the admin `C1pd9uv64yOBYfrPaktXet7Pxfr2`, `bama-system`, and `demo-test1..3`. All 39 deletions succeeded and none failed.
- **Firestore, what is left:**

  | Collection | Docs left | Subdocuments |
  |---|---|---|
  | chats | 9 | 30 |
  | config | 2 | — |
  | courseRequests | 2 | — |
  | courses | 5 | 2 |
  | marketplace_listings | 5 | — |
  | notifications | 62 | — |
  | priceOffers | 9 | — |
  | projects | 5 | 7 |
  | pushTokens | 1 | — |
  | reviews | 6 | — |
  | users | 5 | 8 |
  | videoJobs | 1 | — |

  Emptied completely: `adminActions`, `bundleOffers`, `cancellationLogHidden`, `cancellations`, `communities` (old), `communityRequests`, `reports`.
- **Storage:** 12 files left (course, community and listing images, and the admin's course video). 137 deleted.
- **`verify`:**
  - nothing left to delete, nothing in Auth to delete, nothing in Storage to delete
  - no kept document refers to a deleted user
  - no subcollections are left without a parent document
- **Triggers during the wipe:** no notification was created, no `feeBlocks` document appeared, and no users document came back.
- **`config/demoAccounts.communityIds`:** now lists the 4 communities the demo accounts own. "BAMA Demo Community" was deleted and its id removed.

## Issue found and fixed during the run
`--commit` read only documents that exist. A deleted document whose subcollections were never deleted (a "missing parent") was therefore invisible to the wipe. After the first run, these were still there:
- `users/V7Zf…/private/contact`, which held **a deleted person's phone number**
- 8 course clicks under 4 courses that had already been deleted

The script now also walks `listDocuments()`, and the classifier deletes any missing parent unless it belongs to a kept user. That case is tested and mutation-checked. A second `--commit` removed the 5 leftover groups, and a full scan shows none remain. The managed Firestore export included these documents; the JSON dump did not, and has been fixed for future runs.

## Backup (retention: delete on 2026-11-03 unless the owner says otherwise)
- **Bucket:** `gs://bama-af0a0-wipe-backup-20261003`, in europe-west1. It is private: public access prevention is enforced, access is uniform at the bucket level, and only project members have rights. An anonymous request returns 403, and the bucket is not linked to Firebase.
  - **Used:** `firestore-4` (the managed export, operation SUCCESSFUL) and `storage-3` (149 files, 1,997,637,630 bytes, identical to the source).
  - **Superseded, unused:** `firestore`, `firestore-2`, `firestore-3`, `storage`, `storage-2`.
- **Local copy:** `~/bama-backups/wipe-2026-10-03/`. It holds:
  - `auth-users.json`: 44 users, mode 600
  - `firestore-docs.json`: 2,360 documents
  - `firestore-export/` and `BACKUP_OK.json`
  - the demo checks from before and after the wipe
  - the superseded attempts
- **Restore steps:**
  - **Firestore:** `gcloud firestore import gs://…/firestore-4 [--collection-ids=…]`
  - **Auth:** `firebase auth:import auth-users.json --hash-algo=SCRYPT …`. The hash key comes from the Console and is not stored anywhere.
  - **Storage:** copy `storage-3/*` back.

## Checks
- **Demo accounts:** 45 of 47 checks pass. Before the wipe, 46 of 46 passed. Both failures come from changes made in the app this morning, not from the wipe:
  - test3 is in no chat. It left the four project chats while the owner was testing; the backups show this happened before the wipe. Its only other chat was "BAMA Demo Community", deleted by owner decision.
  - There are 7 completed engagements, not 6. The active project was completed in the app at 07:40. All 7 fees are paid.
- **Admin:**
  - The Auth claim `role: admin` is present, the account is enabled, the user doc passes every gate, and the profile and phone are present.
  - **Still to confirm by hand on a device:** signing in to the admin screens. The account uses Google sign-in, and my credentials cannot create a sign-in token.
- **A new user can register.** Through the real web form, a new account goes from register to verify-email to setup to mode select to client home. The user doc gets consent 1.4, age, profile setup and phone, with no page errors. The test account was deleted afterwards and left nothing behind.
- **⚠ A device still signed in as a deleted user does NOT land on the login screen.** On the web build, after the user's documents and Auth account were deleted, reopening the app showed **mode select**. Tapping "client" opened the **client home**, greeting the user with no name. No page error appeared. This is reported only, not fixed, as instructed. It is probably because the cached session stays valid until the ID token expires, and the gates don't treat a missing `users/{uid}` as signed out.
