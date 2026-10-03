# Demo follow-ups after the wipe (2026-10-03)

## 1. Demo communities by owner (deployed)
A community counts as demo when its **owner is a demo account**. No config edit is needed. `config/demoAccounts.communityIds` stays as an optional extra, for a community that someone neutral owns.

**Changed rule:** `communityOnCallerSide` → `communityIsDemo(communityId)`.
- **Allows:** a join request, or a repeat request, when the caller and the community are on the same side. A community is demo if its owner is a demo account, or if it is listed in `communityIds`. Admins and neutral uids pass.
- **Denies:** a real user's request to any demo-owned community, listed or not, and a demo user's request to a real community.
- **Cost:** one extra read on a join request, for the community document. The maximum is still 4 reads per request.

**Code:**
- Rules: `firestore.rules`, deployed.
- Functions: `functions/src/demo.ts`, `communityIsDemo` / `communityOnSide(…, ownerId)`, used by `getCommunityInvite` (deployed).
- App: `src/core/demo/demoSides.ts`, `isDemoCommunity` / `isCommunityOnSide(…, ownerId)`, used by the Discover list.

**Checks:**
- **Emulator:** 164 of 164 cases pass. Mutating either the owner branch or the list branch fails cases.
- **Existing rules probes:** all pass.
- **Production:** 42 of 42 pass, including a new case: a real user's join request to a demo-owned community that is *not* in `communityIds` is denied.

## 2. Demo courses
- Courses now have a `demoOnly` field. Approving a course request from a demo account sets it (`src/app/admin/courses.tsx`).
- The 3 existing "Demo-" courses are marked `demoOnly` in production: Film editing, Graphic designer, Recording studio.
- **Courses tab:** demo accounts see only `demoOnly` courses, real users see only the others, and admins see all. This is in `isCourseOnSide`.
- **Enforced in the app only.** Builds already installed show every course. The rules can't hide individual documents in a list without breaking those builds.

## 3. Snapshot of hand-made demo content (built, not run)
- **Command:** `snapshot-content` (alias `snapshot-portfolio`), plus a new `restore-content --commit`.
- **What is backed up for each demo account:**
  - portfolio items and the avatar
  - listings and their photos, except setup's own two seeded listings
  - every community the account owns, with its channels, messages, join requests, member stats, events, image and chat media
- **Where:** `demoBackups/{uid}/…` and Storage `demo-backup/{uid}/…`. Both are Admin-only.
- **Restore** uses the same ids and paths with the same download tokens, and adds the restored communities to `communityIds`.
- **`setup`:** it snapshots automatically before its cleanup. That snapshot never replaces a backup with an empty one, and never runs from a deleted account. Setup restores afterwards.
- **Side effects of restoring messages:** they fire `onNewCommunityMessage`. The chat and `memberStats` documents are rewritten from the backup afterwards, and the notifications that were created are deleted. The pushes themselves still reach devices signed in as a demo account.
- **Emulator rehearsal, all exact:**
  - snapshot, then cleanup, then restore brings back every document and file with identical download tokens
  - the seeded listing is left out of the backup
  - with the trigger's side effects simulated, the counts are restored, 1 notification is removed, and unrelated notifications stay
- **Not run against production.** Run it when the owner says the content is ready: `node scripts/demo-accounts.mjs snapshot-content --commit`.

## 4. A device signed in as a deleted user now goes to login
**Two fixes:**
- **The gate:** `useOnboardingGate` and mode select now treat "loading finished and no user" as signed out and redirect to `/(auth)`. Before, a screen that was already open stayed put.
- **On launch:** `useAuth` reloads the account (`accountGone`) and signs out on `auth/user-not-found` or `auth/user-token-expired`. It does not sign out on `user-disabled`, which goes to the moderation flow, or on network errors.

**Tests:**
- `useAuthAccountGone.test.ts` (5 tests) and 2 new gate tests. All mutations are caught.
- **Live, on the web build against production:** a signed-in user was deleted and the app reopened. It lands on the login screen.
- The registration-to-home flow still passes.

## 5. Admin sign-in on iPhone
The admin account `bama.app.hk@gmail.com` has two providers: **google.com** and **password**. The new build hides the Google button behind `GOOGLE_SIGNIN_ENABLED`, but the email and password form is always shown. So the admin signs in with email and password. If the password is unknown, "Forgot password" sends a reset email to that inbox. No fix is needed.
