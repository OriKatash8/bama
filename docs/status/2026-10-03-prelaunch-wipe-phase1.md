# BAMA — pre-launch production wipe (Phase 1 report)

## Context
Before launch, production must hold only the admin account, the three App Review demo accounts and their data, `bama-system`, and config. Everything else is test data from development and goes. This is permanent.

Phase 1 so far has been read-only. Every number below comes from live read-only queries made today. Plan mode blocked the backups, because they write an export, so they run first after approval, before any delete.

Owner decisions already taken:
- `orikatash8@gmail.com` is deleted.
- The admin's 4 test projects are deleted.
- Only the 2 courses are kept. The old `communities` doc and every community request are deleted.
- `adminActions` is deleted.

---

## 1. Backup (first step after approval, before any delete)
Everything goes outside the project folder: `~/bama-backups/wipe-2026-10-03/`, plus a new bucket `gs://bama-af0a0-wipe-backup-20261003` in the same project.

| What | How | Restore |
|---|---|---|
| **Firestore, complete** | `gcloud firestore export gs://bama-af0a0-wipe-backup-20261003/firestore` (managed export, every collection and subcollection), then `gcloud storage cp -r` to the local folder | `gcloud firestore import gs://…/firestore [--collection-ids=…]`. Import overwrites docs that have the same id and leaves other docs alone, so a single collection can be brought back. |
| **Firestore, readable copy** | Admin SDK JSON dump of every doc path → `firestore-docs.json` | Lets us restore one document by hand without a full import. |
| **Auth users** | `firebase auth:export ~/bama-backups/wipe-2026-10-03/auth-users.json --format=json` (uids, emails, providers, claims, scrypt password hashes) | `firebase auth:import auth-users.json --hash-algo=SCRYPT --hash-key=… --salt-separator=… --rounds=8 --mem-cost=14`. The key values are in Console → Authentication → ⋮ → Password hash parameters, and are **not** written anywhere by me. Apple and Google users come back linked to the same provider ids. |
| **Storage** (not covered by the Firestore export) | `gcloud storage cp -r gs://bama-af0a0.firebasestorage.app/* gs://…-wipe-backup-20261003/storage/` (134 files, ~2.0 GB, about 5¢ a month) | Copy the objects back. Their metadata, including download tokens, is kept, so old URLs work again. |

**Not covered:**
- Push tokens on devices: the docs are backed up, but a deleted user's device simply stops receiving pushes.
- Email verification state: it is part of the Auth export, so it is covered.
- Anything outside Firebase: Expo, App Store.

**Retention:** the bucket (private, with public access prevention enforced) and the local folder are **deleted on 2026-11-03** unless you say otherwise.

## 2. Inventory (live, 2026-10-03)

**Auth:** 44 users. **5 kept:**
- `C1pd9uv64yOBYfrPaktXet7Pxfr2` bama.app.hk@gmail.com (admin claim)
- demo-test1, demo-test2, demo-test3
- bama-system

**39 deleted:**
- roi10hamm@gmail.com, orikatash8@gmail.com, superpook.yo40@gmail.com, sasa@gmail.com, asd@gmail.com
- hoho@gmail.com, mezot@gmail.com, ofricachlon2003@gmail.com, hammnirit@gmail.com, eiloncn007@gmail.com
- lakoh@gmail.com, w9k7stvb8d@privaterelay.appleid.com, p596chw56f@privaterelay.appleid.com, oriorior@gmail.com, niv.ratzer@gmail.com
- power14on@gmail.com, yael10yael@gmail.com, ido.steinberg@gmail.com, kaki@gmail.com, bobo@gmail.com
- adcadc@gmail.com, yoyo@gmail.com, netaseren@gmail.com, zivnave1@gmail.com, noyaman@gmail.com
- ksynzct4fj@privaterelay.appleid.com, assaf1823@gmail.com, tttt@gmail.com, yoad.ye@gmail.com, roihamm10@gmail.com
- ronidalomi123@roniron.com, bdika@gmail.com, nono@gmail.com, hili.dagan10@gmail.com, malirshom8@gmail.com
- popo@gmail.com (disabled), jswbzwszyc@privaterelay.appleid.com, lihi339@gmail.com, orioriori@gmail.com

**Firestore**

| Collection | Total | Delete | Keep | Kept = |
|---|---|---|---|---|
| users (+ subcollections) | 45 (+64) | 40 (+56) | 5 (+8) | admin, 3 demo, bama-system. The deleted docs include 2 user docs whose Auth account is already gone. |
| projects (+ fees, meetings, missions, paymentRequests) | 56 (+74) | 51 (+65) | 5 (+9) | the demo projects |
| priceOffers | 74 | 65 | 9 | demo offers |
| bundleOffers | 10 | 10 | 0 | |
| chats (+ messages, channels, events, stats) | 57 (+378) | 51 (+344) | 6 (+34) | 4 demo groups, the demo DM, the demo community |
| reviews | 14 | 8 | 6 | demo reviews |
| marketplace_listings | 2 | 0 | 2 | demo listings |
| notifications | 1469 | 1408 | 61 | demo only. The admin's 19 all point at its deleted test projects, so they are deleted. |
| pushTokens | 10 | 9 | 1 | the admin's device |
| reports | 9 | 9 | 0 | |
| communityRequests | 13 | 13 | 0 | |
| communities (old, unused) | 1 | 1 | 0 | |
| courses (+ clicks) | 2 (+4) | 0 (+4) | 2 | both courses; the clicks are all by deleted users |
| videoJobs | 32 | 31 | 1 | the admin's course video |
| adminActions | 14 | 14 | 0 | |
| cancellations / cancellationLogHidden | 2 / 2 | 2 / 2 | 0 | |
| config | 2 | 0 | 2 | pricing, demoAccounts (and any other config doc) |

These collections are **absent today** and need nothing: `feeBlocks`, `subscriptions`, `rateLimits`, `projectApplications`, `courseRequests`, `communityInvites`, `demoBackups`, `bookings`.
There is **no phone index**: phones live only in `users/{uid}/private/contact`, which is deleted with each user.

**Storage:** 134 files. **Kept: 3**
- `courses/C1pd9uv…/…mp4`
- the 2 course cover images

**Deleted: 131**

| Path | Files |
|---|---|
| portfolio | 43 (1.84 GB) |
| chat-images | 33 |
| chat-audio | 24 |
| avatars | 7 |
| chat-videos | 5 |
| users/*/avatar | 5 |
| community-images | 5 |
| unused course-images | 4 |
| report evidence | 4 |
| a file under `marketplace/` whose listing no longer exists | 1 |

Demo accounts have no Storage files yet; the portfolio is still to be uploaded.

## 3. For your decision: as decided
- **Communities.** Kept: "BAMA Demo Community" (owner test1, 3 members). Deleted:
  - "פרמייר 2026" (owner Roi Hamm, 4 members)
  - "קהילת עורכים cap cut" (owner "bobo", 2 members)
  - the old `communities/צלמי sony` (owner admin, 1 member) and its request
- **Courses:** "Social media team" and "Photography course" are kept.
- **Owned by the admin, or with the admin as a participant:**
  - 4 projects (רועי בדיקה 1/2/3, Djdndnnd), their offers, fees and group chats: deleted.
  - 19 notifications: deleted.
  - Kept: the admin's Auth user, claim, user doc, `profile`, `private/contact` (needed for the phone gate) and push token.
  - The admin owns no listings or chats besides the above.

## 4. Records that mix kept and deleted users: what happens to each

| Records | What they are | Action |
|---|---|---|
| 14 `adminActions` | admin acting on deleted users | delete (decided) |
| 3 `chats/sys_{uid}` | `bama-system` + a deleted user | delete |
| 1 project `lhBVy9…`, its 4 offers and its group chat | admin client, deleted pro | delete (decided) |
| 5 reports | deleted reporter, admin reported | delete |
| 21 project group chats with an emptied `members` list | follow their project, all of which are deleted | delete |

After the plan is built, the script **refuses to run if any kept document still references a deleted uid**: members, clientId, professionalIds, posterId, reviewer, offer pro, `unreadCount` keys, pendingMentions or mutedChats.

## 5. Triggers: no push, no email, nothing recreated
- **The script only deletes.** There are no writes and no updates, so none of the onCreate or onUpdate triggers fire. Those include `onNotificationCreate`, which sends pushes, and `onProjectClosed`, which posts phone numbers.
- **Auth deletion:** no trigger exists (`onUserCreate` is create-only). **Storage deletion:** no trigger. **Email:** no function sends email.
- **The only delete-firing trigger is `onFeeWrittenRecomputeBlock`** (`functions/src/lifecycle/feeOverdue.ts:109`). For a deleted pro it finds no fees and no `feeBlocks` doc, and returns without writing (`recomputeFeeBlock`, line 86).
- **The other trigger on a deleted path** is `onRemovalRequest`, which returns on delete. `onCommunityDeleted` is not deployed.
- **Order of deletion:**
  1. the deleted users' **push tokens**, first, so nothing can push to them mid-wipe
  2. notifications
  3. offers
  4. projects (recursive)
  5. chats (recursive)
  6. remaining collections
  7. users (recursive)
  8. Storage
  9. Auth
- **Proof after the wipe:**
  - no doc in `notifications`, `feeBlocks` or `users` has been created since the wipe began
  - no new docs at all, apart from none expected

## 6. Counters and stats after the wipe
Nothing stored needs a reset:
- Admin dashboard counts, registration stats and course clicks are computed live.
- `feeBlocks`, `subscriptions` and `rateLimits` don't exist.
- The kept chats' `unreadCount`, `channelUnread` and `memberStats` are demo-only.
- The admin's and demo users' `mutedChats` and `pendingMentions` are empty.
- `config/demoAccounts` is unchanged: its `neutralUids` are bama-system and the admin.
- `config/pricing` is unchanged.

The script asserts every one of these afterwards.

## 7. Script: `scripts/wipe-prelaunch.mjs` (committed)
- **Dry run by default; `--commit` deletes.**
- Logs and the delete manifest go to `--out`, default `~/bama-backups/wipe-2026-10-03/`.
- **Hard-coded keep list:**
  - `KEEP_UIDS` = admin, demo-test1..3, bama-system
  - `KEEP_COURSES` = the 2 course ids
  - config is kept whole
- **Refuses to run (exit 2) if:**
  - a keep uid is missing from Auth
  - the admin lacks `role:'admin'`
  - `config/demoAccounts.uids` ≠ the demo uids
  - the backup marker file `~/bama-backups/wipe-2026-10-03/BACKUP_OK.json` is absent. The backup step writes it with the export paths and counts.
- **Classification:** a doc is kept only if every user it references is on the keep list *and* it belongs to a kept parent: an offer → a kept project, a group chat → a kept project, a click → a kept course. Everything else in the listed collections is deleted. A collection not in the plan aborts the run.
- **Prints:** per collection the total, delete and keep counts, the Auth emails to delete, and the Storage counts. With `--commit` it deletes in the order in §5, then re-counts and runs the orphan scan.
- **`--verify` (read-only):**
  - the counts equal the plan
  - Auth holds exactly the 5 kept uids
  - **orphan scan:** every uid referenced anywhere exists in Auth; every offer, fee, review and chat points at an existing parent; every Storage file is under a kept uid, a kept course or a kept doc

## Sequence and gates
1. On approval: copy this report to `docs/status/2026-10-03-prelaunch-wipe-phase1.md`, write the script, and run its tests: a jest/node test of the classifier on fixtures, plus a mutation check.
2. **Wait for you to say "paid"** after marking the 6 demo fees. Then run `demo-accounts verify` as the **pre-wipe baseline**. It must pass fully; its JSON is saved for comparison.
3. **Backups (§1):**
   - Create the bucket with **public access prevention enforced** and uniform bucket-level access, and no `allUsers`/`allAuthenticatedUsers` bindings.
   - The bucket is not linked to Firebase, so Storage rules and the Firebase SDK cannot reach it. I prove that with `gcloud storage buckets describe` plus the IAM policy, and an unauthenticated HTTP GET of an object that must return 401/403.
   - Then run the dry run.
4. **GATE W1. Proof the backup is complete:**
   - the Firestore export operation is `SUCCESSFUL`, from `gcloud firestore operations describe`
   - the Auth export holds **44** users
   - the Storage copy has **134** files with the **same total byte size** as the source
   - the JSON dump's document count per collection and subcollection equals the live inventory
   - the dry-run output matches §2

   You then say "wipe".
5. Run `--commit`, then `--verify`.
6. Run `demo-accounts verify` again and compare it with the step-2 baseline: the same checks, all passing.
7. **Signed-in deleted user:**
   - Before the wipe, a throwaway account signs in on the app's web build (Playwright, against production).
   - The account is deleted the same way the wipe deletes: Auth user, `users` doc and data.
   - I reload the app and screenshot it. It must land on the **login screen**, not an error or a blank screen.
   - If it doesn't, I **report it without fixing it**.
   - The throwaway account is then cleaned up.
8. **Sign-in checks:**
   - The admin signs in, `getAdminStatus` returns admin, and the admin screens load.
   - A brand-new throwaway user registers through the real flow: `createUser`, then consent fields, then verified, then setup, then the home route resolves through `nextAuthRoute`. Then it is deleted again.
9. Phase 2 status doc, then commit the script and doc (staged by path). The doc records: **the backup bucket `gs://bama-af0a0-wipe-backup-20261003` and `~/bama-backups/wipe-2026-10-03/` are to be deleted on 2026-11-03 unless you say otherwise.**

## Verification
- The dry-run counts equal §2.
- After `--commit`:
  - `--verify` shows exactly 5 Auth users and per-collection counts equal to "Keep"
  - zero orphans, zero new notifications, `feeBlocks` absent
  - Storage holds 3 files
- `demo-accounts verify` passes as before. The fee check passes once you've marked the fees.
- The admin is still an admin, and a new user reaches home.
