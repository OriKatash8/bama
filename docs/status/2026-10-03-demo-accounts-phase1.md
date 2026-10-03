# BAMA — 3 demo accounts for Apple App Review (Phase 1 report)

## Context
Apple App Review needs working sign-ins. We need three fully onboarded production accounts (test1..3), each set up as both client and pro with every skill, plus realistic activity between them. Because they hold every skill, they must not leak into real users' search, matching or notifications, and they must not be able to contact or hire real users. Reviewers may delete an account, so the setup must be re-runnable and the hand-uploaded portfolio must survive a delete.

Phase 1 was read-only. The only production calls were GET reads: the Auth config showed no password policy, and none of the 3 emails exist yet. Owner decisions so far: the community is a new, hidden demo community.

> **🆕🆕 Second revision** (neutral accounts, wider production checks, seed timing, holes report). Changed parts are marked 🆕🆕: §3 helpers, §3c (functions helper), §3e, §5 file list, §5a steps 4 and 6-8, §6.
>
> **🆕 Revised after the owner's four conditions.** Sections marked 🆕 are new or changed: §0, §1 (phone row), §3, §5 (sequence), and Verification.
> - **Phones:** +972-55-555-000X is in 055-55X, a range allocated to Rami Levy, so real people can hold it. I switch to **+44 7700 900001..3**, Ofcom's range reserved for drama, which can never be given to a subscriber.
> - **OTA is impossible:** `EXUpdatesEnabled=false` in `ios/*/Supporting/Expo.plist`, and there is no updates URL, runtimeVersion or channel. The owner chose: client filters ship in the new build; the seed runs after rules + functions. On builds already installed, real users may *see* demo items in browse lists, but every contact path is blocked on the server.
After approval this report is copied to `docs/status/2026-10-03-demo-accounts-phase1.md`. Memory says status reports go there.

---

## 1. Gates and how each is satisfied

| Gate | Checked at | How it is satisfied |
|---|---|---|
| Auth user exists, the given 6-digit password | — | `auth.createUser({uid, email, password, displayName, emailVerified:true})`. The project has no password policy, so Firebase accepts a 6-char password, and the login form only checks the field is non-empty. **But:** the app's *register* and *change-password* rule (≥8 chars, uppercase, digit) would reject it. Login works; only "change password" to it would fail. |
| Email verified | `emailVerification.ts:10`, rules `verified()` | `emailVerified:true` on the Auth user |
| `users/{uid}` exists, not suspended | `useAuth.ts:86-110` | Full `set` (not merge) after `onUserCreate`. No `moderation` field, no `email`, no legacy `role`. |
| Terms 1.4 | `needsConsent.ts:9`, `legal.ts:6` | `termsVersion:'1.4'`, `termsAcceptedAt` |
| Age | (recorded, no gate) | `ageConfirmed:true`, `ageConfirmedAt` |
| First-time setup | `needsProfileSetup.ts:9` | `needsProfileSetup:false` |
| Phone 🆕 | `usePhoneGate.ts:15` | `users/{uid}/private/contact {phone:'+44770090000N'}`. This is valid E.164 and passes the rules regex and `normalizePhone`. Ofcom reserves 07700 900000-900999 for drama, so it can never be a subscriber's number: tapping call or WhatsApp reaches no one. |
| Client mode | `(client)/_layout.tsx:25` | `clientOnboarded:true` |
| Pro mode | `(professional)/_layout.tsx:24` | `profile/data.proProfileCompleted:true` and non-empty `roleSkills` |
| Mode select | AsyncStorage, per device | Not stored. The reviewer picks a mode once and the switcher works both ways. |
| Not admin | custom claim `role` | No custom claims. Verified in Phase 2. |
| Fee block | `feeBlocks/{uid}` | All demo fees end up paid, so no block. |
| Review popup | `ReviewFlowGate.tsx` | Completed projects get `reviewsCompleted:true` after their reviews are written. |

**Profile.** `roleSkills` covers all 8 roles from `src/features/crew/data/categories.ts` with every specialization in each (49 in total). The profile also gets `bio`, `availability:'available'` and a `priceList`.

**Equipment.** The app has no brand, model or lens fields: equipment is a list of `{name, category}` with categories camera, lens, lighting, audio, drone, grip and other. Brand and model go in `name`, and stabilizers go under `grip`. Each account gets a different realistic list of about 8-10 items, for example:
- test1: "Sony FX3", "Sony FE 24-70mm f/2.8 GM II", "Rode NTG5", "Aputure 300d II", "DJI RS 3 Pro"
- test2 and test3: Canon and Blackmagic kits.

No contact details go in the bio or the equipment. The portfolio stays empty.

## 2. Real flows vs Admin SDK
I'll use a hybrid. The script signs in **as each demo account** with the client SDK, as the existing `probe-*-prod.mjs` scripts do, and drives the real code paths:

- **Admin SDK (no user flow exists for these):**
  - Auth users and the onboarding docs above
  - the rental listing (rules allow only admins to create rentals)
  - the community doc (admin-only)
  - `config/demoAccounts`
  - the fee settlement (below)
- **Client SDK as the user (real rules apply):**
  - projects (same fields as `useProjectRequests.ts:68`)
  - price offers (`usePriceOffer.ts`)
  - DMs and messages (same writes as `chatService.ts`, including unread counts)
  - the sale listing
  - community channel messages
  - reviews (same fields as `ReviewFlow.tsx:113`, then `reviewsCompleted:true`)
- **Real callables as the user:** `hireProfessional`, then `confirmCandidate`, then `markEngagementComplete` (pro), then `confirmCompletion` (client). These create the fee docs, group chats, the read-only close and the closing message exactly as production does.
- **Fees marked paid.** The only path is the admin callable `markFeePaid` → `settleFee` (`completion.ts:420`), and the demo accounts must not be admins. So I'll **export `settleFee`** and have the script call that same function from the built `functions/lib` under the operator's admin credentials. It runs the real settlement code with no hand-written fee fields.
  - Paid fees are skipped by the 03:00 charge cron (`cron.ts:228`), so no "charge failed" push is sent.

**Every review has a real engagement behind it.** There are 3 completed projects, and in each one the client hires the other two accounts:

| Project | Client | Hired pros |
|---|---|---|
| P-done-1 | test1 | test2, test3 |
| P-done-2 | test2 | test1, test3 |
| P-done-3 | test3 | test1, test2 |

The client of each project reviews both pros, so every account gets 2 reviews, one from each other account. That makes 6 engagements, 6 fees (all paid) and 6 reviews.

**Other demo activity:**
- **P-open (test1):** open, with 2 vacant slots and pending offers from test2 and test3.
- **P-active (test2 client, test3 pro):** hired and confirmed, so it is `in_progress`. Its deadline is set +120 days out, so the cron does not prompt or auto-close it.
- **DM test1↔test2:** a few messages.
- **Group chats:** a few messages are posted in each project's group chat before completion.
- **Listings:** one secondhand listing by test1 and one rental by test2. Both have no image; you can add one in the app.
- **Community:** a new hidden "BAMA Demo" community owned by test1, with all 3 accounts as members and a couple of messages.

⚠ **Account deletion.** `deletion.ts:77-135` blocks deletion while someone has an open engagement. That means **test2 and test3 can't delete while P-active exists; test1 can.** Put "use test1 to test account deletion" in the App Review notes.

## 3. Isolation design 🆕

**The marker.** `config/demoAccounts {uids:[...], communityIds:[...]}`. Only the Admin SDK writes it; the existing `config` rules already deny client writes.

**Why a list doc.** Every side check costs **exactly one read**, however many members a write names: rules can test `members.toSet().intersection(demoSet)`. Per-user side docs would cost one read per member.

**Rules helpers 🆕🆕.** **Neutral uids** are `bama-system` plus every admin. A neutral uid counts as neither side, so it never fails a check.

- **Caller is an admin:** detected from the token (`request.auth.token.role == 'admin'`).
- **Other party is an admin:** rules can't read another user's claims, so `config/demoAccounts.neutralUids` lists them. The seed script fills it from Auth (`bama-system` plus every user with `role:'admin'`), and `scripts/set-admin.mjs` is changed to add new admins to it too.
```
function cfg()       { return get(/databases/$(database)/documents/config/demoAccounts).data; }
function hasCfg()    { return exists(/databases/$(database)/documents/config/demoAccounts); }
function demoSet()   { return hasCfg() ? cfg().uids.toSet() : [].toSet(); }
function neutralSet(){ return hasCfg() ? cfg().neutralUids.toSet().union(['bama-system'].toSet()) : ['bama-system'].toSet(); }
function callerSet() { return isAdmin() ? [].toSet() : [request.auth.uid].toSet(); }
// the caller (unless admin) plus every uid in l, minus neutrals, lie on one side
function oneSide(l)  { let s = l.toSet().union(callerSet()).difference(neutralSet());
                       return s.intersection(demoSet()).size() == 0 || demoSet().hasAll(s); }
function sameSide(a, b) { return oneSide([a, b]); }
```
- `exists` and `get` on the same doc count as one read.
- **When the doc is absent**, `demoSet()` is empty, so every check is true.
- **Functions** (`functions/src/demo.ts`) use the same logic: neutral = `bama-system`, `neutralUids`, or a caller with the admin claim.
- **No cache: the config doc is read fresh on every invocation**, so there is never a stale value (see §5a step 6).

### 3a. Every way a user can reach another user, and where it is enforced

| # | Path | Where it is decided | Same-side enforcement |
|---|---|---|---|
| 1 | Direct chat create | `chatService.ts:127` → rules `chats` create (572) | **Rules:** `oneSide(request.resource.data.members)` for every chat type |
| 2 | Purchase chat (marketplace "negotiate") | `marketplaceService.ts:46` → same rule | Same rule as #1 (the seller is in `members`) |
| 3 | Group chat created by the client (`createProjectGroup`, unused but still allowed by rules) | rules 572 | Same rule as #1 |
| 4 | Group chat created by hire, and pros added later | `hireProfessional` (`hire.ts:440`, Admin SDK) | **Function:** `loadAndEnforce` (hire.ts:41) rejects `!sameSide(clientId, proId)` with `failed-precondition` |
| 5 | Adding members to an existing chat (owner, any type) | rules chats update (661-674) | **Rules:** when `members` changes, `oneSide(request.resource.data.members)` |
| 6 | Community join request | rules joinRequests create (759) | **Rules:** `isDemo(auth.uid) == (cid in communityIds)` |
| 7 | Owner approves a join request (also approve-all) | rules joinRequests update (775), chats update, communityEvents (817) | Covered by #5 (the members change) and #6 |
| 8 | Community invite (callables, no client UI yet) | `functions/src/communities/invites.ts` | Invites only lead into #6, which is the gate. **Function:** `getCommunityInvite` also refuses across sides |
| 9 | Mentions (`pendingMentions` written by `fanOut`) | rules 189 (mentions ⊆ members) | Covered: members are one side (#1, #5) |
| 10 | Messages, sharing a listing into a channel, meetings, missions, removal requests | rules 688/710/909/916/953 (membership or project party) | Covered: membership and hire are one side |
| 11 | Price offer and bundle offer | rules 974/996 `offerCreateValid` | **Rules:** `sameSide(auth.uid, get(projects/p).data.clientId)`. This is the same doc as the existing `exists`, so no extra read. |
| 12 | `projectApplications` | rules 1241 | **Rules:** the same check (+1 read, projects/p) |
| 13 | Project create, open or direct (rules don't check `clientId` today) | rules 878 | **Rules:** `oneSide([clientId] + (targetProfessionalId if set))` |
| 14 | Project update re-targeting `targetProfessionalId` | rules 891 | **Rules:** the same, on update when that field changes |
| 15 | Open-project broadcast push | `onProjectCreate` (triggers.ts:384) | **Function:** recipients filtered with `sameSide(clientId, uid)` |
| 16 | Hire / confirm / reject candidate (system DM with a reason), completion, payment requests, contest | callables in `lifecycle/*` | All need a prior hire, so #4 covers them. **Function:** `rejectCandidate`, `createPaymentRequest` and `respondToEngagementEnd` also get the `sameSide` check (cheap belt and braces) |
| 17 | Phone reveal (`getContactPhone`, closing card) | `contact.ts:14`, `closingTrigger.ts:25` | Bounded by hire. **Function:** `canRevealPhone` adds `sameSide` |
| 18 | Review | rules 1162 | **Rules:** `sameSide(auth.uid, professionalId)` |
| 19 | Marketplace reserve (any user can reserve any listing) | rules 1103 (new-buyer clause) | **Rules:** `sameSide(auth.uid, resource.data.posterId)` |
| 20 | Report | rules 1171 | **Allowed across sides on purpose.** It reaches only admins, the reported user is never notified, and Apple tests the report flow. |
| 21 | Block | rules 527 | Reaches no one; unchanged |
| 22 | Client-written notifications | rules 1217 deny | Already impossible |
| 23 | System DMs / `bama-system` | Admin SDK | Exempt (server-only); unchanged |
| 24 | Admin callables | `requireAdmin` | Out of scope (admins act on everyone) |
| 25 | Discovery reads: search, profile, portfolio, reviews, projects feed, listings, communities | client queries | Rules can't hide docs per side without breaking list queries, so **filtered in the client** (§3c). Builds already installed still *see* demo items but can't act on them (#1-19). |
| 26 | Deep links | none exist today | — |

**Pre-existing holes (not fixed here; reported for a separate task).** Today, unrelated to demo, a verified user can:
- create a chat they are not a member of, with any `ownerId`;
- create a project owned by another uid;
- review any pro without an engagement;
- reserve any listing.

The rules above make these impossible *across sides*, but I do not change real-to-real behaviour without your separate approval.

### 3b. Rules reads per request (limit: 10 for a single write, 20 for a batch or transaction)

| Write | Today (distinct docs) | After |
|---|---|---|
| DM / purchase chat create | 0-2 (block exists ×2) | **3** |
| chats update (members change) | 0 | **1** |
| priceOffer / bundleOffer create | 3: project, `config/pricing` switch, `feeBlocks/{uid}` | **4**. The project `exists` becomes a `get` on the same doc. |
| projectApplications create | 2: `config/pricing`, `feeBlocks` | **4** |
| projects create / update | 0 | **1** |
| review create | 0 | **1** |
| listing reserve | 0 | **1** |
| joinRequest create | 0-1 (invite) | **1-2** (+ config; `communityIds` is in the same doc) |
| approve-all batch (transaction / batch) | chat + requests | **+1 total**. The config doc counts once per request, so the 20-read batch limit is not newly at risk. |

Maximum after the change: **4**, well under 10.

### 3c. Client filters (ship in the new build only; no OTA)
New `src/core/demo/useDemoAccounts.ts` subscribes to `config/demoAccounts` and exposes `isSameSide(me, other)`. Side filters apply in:
- `useSearchProfessionals`
- `useUnifiedSearch`
- the scarcity count at `home/summary.tsx:140`
- `useNoticeboard` (by `clientId`)
- `useMarketplaceListings` (by `posterId`)
- `useCommunityDiscovery` (by `communityIds`)
- the profile screens: a cross-side profile shows "not available"

Admin user counts (`counts.ts`, `useRegistrationStats.ts`) exclude demo uids.

**New shared helper in functions 🆕🆕.** `functions/src/demo.ts` reads the config doc **fresh on every invocation, with no cache**, and treats a missing doc as "nobody is demo". Neutral handling is the same as in the rules.

### 3e. Talking to BAMA itself 🆕🆕
The emulator (states A and B) and the production checks prove each of these works for a demo user *and* for a real user:

| Flow | Mechanism | Effect of the change |
|---|---|---|
| Contact us | `settings/contact.tsx`: `mailto:` and `wa.me` links to BAMA | No Firestore write; unaffected (checked by reading the code) |
| System DMs (`sys_{uid}`, `bama-system` + user, read-only) | Admin SDK writes in `functions/src/system/index.ts:49` (`sendSystemMessage`, moderation notices, `rejectCandidate`) | Server write; user reads via `members array-contains`. Tested: a demo user and a real user can each read their `sys_` chat and its messages. `bama-system` is neutral, so the system DM to a demo user is never blocked. |
| Reports (user, project, community) | rules 1171 | No side check at all; allowed both ways. Tested: demo reports a real user, real reports a demo user, both allowed. |
| Community request (ask BAMA to open a community) | rules 845 `communityRequests` | Unchanged; tested for both sides |
| Admin reads a project chat | rules (admin read) | The caller is an admin, so neutral; tested on a demo project chat |
| Admin moderation, `markFeePaid`, `adminCommunityAction` | admin callables | The caller is an admin, so neutral |
| A user's chat with an admin uid (if one exists) | chat create | Admin uids are in `neutralUids`, so it is allowed from both sides; tested |

### 3d. Tests
- **Emulator rules probe `scripts/probe-demo-isolation-rules.mjs`**, run in two states:
  - **(A) `config/demoAccounts` absent** (production's state at deploy). Every existing flow is allowed, using the app's exact write shapes: DM, purchase chat, project open and direct, retarget, offers (price and bundle), application, review, join request (direct and invite), owner approve and approve-all batch, members add and leave, messages, listing reserve.
  - **(B) Present.** Same-side is allowed and every cross-side path #1-19 is denied, in both directions.
- **Existing suites.** All existing emulator rules probes (`probe-*-rules.mjs`) pass unchanged, since they run in state A.
- **Unit tests** for `demo.ts`, the hire / onProjectCreate / callable guards and each client filter. Each guard is mutation-tested with its anchor asserted.

## 4. Re-runnable setup, cleanup and the portfolio
One script, `scripts/demo-accounts.mjs`, following the pattern of `seed-config.mjs` and `seed-candidate-review-web.mjs`:
- Dry-run by default; `--commit` actually writes.
- Subcommands: `setup` | `cleanup` | `snapshot-portfolio` | `verify`.
- The password comes from the env var `DEMO_PASSWORD` and is never written to a file.
- Credentials come from ADC, and the web config comes from the `EXPO_PUBLIC_*` values. There is no `.env` in the project; the script reads them from outside it.

**Fixed uids** `demo-test1..3`. Admin `createUser` accepts a custom uid, so the same uid comes back after a reviewer deletes an account. That keeps Storage paths and portfolio URLs stable.

**`cleanup`** removes everything that belongs to the demo uids:
- projects where `clientId` is a demo uid, with their subcollections
- offers and applications
- chats where a demo uid is a member, with messages, channels, join requests, community events and member stats
- reviews where a demo uid is reviewer or professional
- listings, notifications, push tokens and `feeBlocks`
- `users/{uid}` and its subcollections
- Storage under `portfolio/`, `avatars/`, `users/{uid}/avatar/` and `chat-videos/`
- the Auth users

**Safety:** any chat or project that has a non-demo participant is *skipped and reported*, never deleted. Cleanup keeps `config/demoAccounts` and the portfolio backup unless you pass `--purge`.

**`setup`** runs, in order:
1. auto-snapshot (if a portfolio exists)
2. cleanup
3. create everything
4. restore the portfolio
5. verify

**Portfolio without re-uploading.** `snapshot-portfolio` copies:
- `users/{uid}/portfolio/*` docs into `demoBackups/{uid}/portfolio/*`. That path is server-only under the catch-all deny rule.
- the Storage objects (`portfolio/{uid}/*`, plus the avatar) into `demo-backup/{uid}/...`, keeping their metadata, including `firebaseStorageDownloadTokens`. That path is admin-only under the default deny rule.

On restore, the objects are copied back to the same paths with the same tokens, so the saved `url`s keep working unchanged.

Run it once after you upload. `setup` also snapshots automatically before every cleanup, and it never overwrites a non-empty backup with an empty one.

## 5. Everything that will be created or changed

**Code (committed, staged by path):**
- New:
  - `scripts/demo-accounts.mjs`
  - `scripts/lib/demoAccountsData.mjs` (profiles, equipment, projects, messages)
  - `scripts/probe-demo-isolation-rules.mjs` (emulator, states A and B)
  - `scripts/probe-demo-isolation-prod.mjs` 🆕 (production check: normal user allowed, then cross-side denied; throwaway users with teardown)
  - `functions/src/demo.ts` with its test
  - `src/core/demo/useDemoAccounts.ts` with its test
  - `docs/status/2026-10-03-demo-accounts-phase1.md`
  - 🆕🆕 `docs/status/2026-10-03-preexisting-rule-holes.md`
- Modified:
  - `firestore.rules`
  - `functions/src/lifecycle/hire.ts`
  - `functions/src/notifications/triggers.ts`
  - `functions/src/lifecycle/completion.ts` (export `settleFee` and guard `respondToEngagementEnd`)
  - 🆕 `functions/src/lifecycle/candidates.ts`, `repricing.ts`, `contact.ts`/`contactPolicy.ts`, `communities/invites.ts` (`sameSide` guards)
  - the client hooks and screens listed in §3c
  - the 2 admin count files
  - 🆕🆕 `scripts/set-admin.mjs` (also add the uid to `config/demoAccounts.neutralUids` when that doc exists)
  - related tests

**Production (only demo-owned; ids recorded in the run log):**
- Auth: `demo-test1`, `demo-test2`, `demo-test3`
- `config/demoAccounts`
- `users/demo-testN`, with `profile/data` and `private/contact`
- 5 `projects` (P-open, P-active, P-done-1..3), with their `fees/*` (7: 6 from the completed projects + 1 for P-active)
- `priceOffers`: 2 pending on P-open, plus the ones on the other projects that get hired
- chats: 4 group (from hire), 1 DM and 1 community (with a `channels/general` doc and messages)
- 6 `reviews`
- 2 `marketplace_listings`
- notifications the triggers write, sent to demo accounts only

Later, after you upload: `demoBackups/*` and Storage `demo-backup/*`.

**Deploys 🆕:**
- `firestore:rules`
- functions: `hireProfessional`, `onProjectCreate`, `rejectCandidate`, `createPaymentRequest`, `respondToEngagementEnd`, `getContactPhone`, `getCommunityInvite`, and anything else the shared bundle touches
- **no OTA** (not possible)

### 5a. Sequence with your approval gates 🆕
1. Implement, then run the tests (§3d). Commit locally and do **not** push yet.
2. **GATE 1:** I show you the full `firestore.rules` diff and the functions diff, **plus a plain-language list with one line per changed rule saying what it now allows and what it denies**, then wait for your approval.
3. Deploy the rules and functions. Keep `git show HEAD~:firestore.rules` as the rollback file in the scratchpad.
4. **🆕🆕 Production check as a normal user, with config absent** (`scripts/probe-demo-isolation-prod.mjs --state absent`).
   - **Setup:** 3 throwaway real-shaped users (client C, pro P, pro Q) and a throwaway community owned by C, made with the Admin SDK. The project seats are pre-filled or targeted, so `onProjectCreate` notifies no real user. Teardown deletes all of it, asserts the deletion, then sweeps again.
   - **It covers every rule that changes, using the app's exact write shapes.** Each of these must be allowed:
     - DM create, and purchase chat create
     - project create, both open and with `targetProfessionalId`
     - project retarget (update `targetProfessionalId`)
     - price offer, bundle offer and `projectApplications`
     - review
     - community join request
     - owner approves it (transaction: joinRequest + members + `communityEvents`), and approve-all (batch)
     - member leaves
     - listing reserve (new buyer)
     - message create
     - report, `communityRequests`, and reading the own `sys_` chat
   - **If any write is denied, I redeploy the rollback rules immediately and report to you.**
5. Push to `main` and **tell you the commit SHA for the TestFlight build.**
6. **🆕🆕 Seed**, in this order:
   1. Record `T0`, then write `config/demoAccounts` with `uids`, `neutralUids` and `communityIds`.
   2. **Stale-value guard.** There is no cache to go stale: every function invocation reads `config/demoAccounts` itself, and a unit test asserts one read per call.
      - **Proof before any project exists:** a throwaway real user calls the deployed `getCommunityInvite` with a probe token for a temporary community id listed in `communityIds`. It must be refused by the new same-side check. That shows a live instance reads the new doc.
      - Only then do projects get created.
      - Step 8 independently proves no push reached a real user.
   3. Create accounts, projects, offers, hires, completions, reviews, chats, listings and the community.
7. **🆕🆕 Production check again with config present** (`--state present`): the **same** normal-user list as step 4, all real-to-real, all must be allowed. Then cross-side writes from a throwaway real user to the demo accounts, which must all be denied. **If any real-to-real write is denied, I stop and tell you before doing anything else.**
8. **🆕🆕 Proof of no stray pushes.** Query `notifications where createdAt >= T0`. Every doc whose `userId` is not a demo uid must be unrelated to demo: no demo `projectId`, `chatId`, `listingId` or sender in `data`. Expected: 0 such docs; I print the count and any offenders. I also list every notification written in the window, grouped by recipient side.
9. Run `verify`, then write the Phase 2 status doc.

**Nothing in the repo or the project folder outside this list.** Run logs and manifests go to the scratchpad.

## Verification (Phase 2)
1. `npm test`, the functions tests and the rules emulator probe pass, with mutations killed. TypeScript is clean.
2. After the rules + functions deploy and the production check (§5a), run `setup --commit`, then `verify`. `verify` signs in as each account with the client SDK and runs the app's own queries:
   - `users` and `profile/data`
   - the equipment list
   - reviews with `published==true`
   - `projects where clientId==me`, the noticeboard query, and `slotHolders`
   - chats with `members array-contains`, and their messages
   - `marketplace_listings` by type
   - community discovery
3. Proof printed by the script and in the status doc:
   - all three accounts pass every gate in `nextAuthRoute`/`useOnboardingGate`, in both modes
   - `customClaims` are empty
   - every demo fee has `status:'paid'` and `feePaid:true`
   - cross-side denials from a real-shaped test user: a throwaway user that is created and deleted again
   - a diff of production counts before and after, outside the demo uids, showing no change
4. Manually sign in on a device as test1 in both modes and check the screens.
5. `git status` shows only the approved files; no stray files.

## 6. Separate deliverable: pre-existing rule holes 🆕🆕
First step after approval: write `docs/status/2026-10-03-preexisting-rule-holes.md`, a report only, with no rule changes. It covers four holes:
1. chat create without the caller in `members` and with any `ownerId` (plus the later owner-only members change)
2. project create with a `clientId` other than the caller
3. a review without a completed engagement
4. any user can reserve any listing

For each hole it gives the exact `firestore.rules` lines, a realistic abuse example and a proposed fix as a rule snippet, with the app writes it must keep allowing. It is committed with this work; the fixes wait for your separate approval.
