# Community invite links: status, 2026-10-05

Phase 1 is built and committed locally. **Nothing is deployed and nothing is seeded in production.** Only `802d73bf` is pushed; the six commits after it are local.

The earlier plan, `2026-10-05-community-invite-links-step1.md`, still contains the superseded proposals (pro-only gate, `hasResume`). This file is the current state.

## What shipped (commits, in order)

| Commit | Checkpoint | What |
|---|---|---|
| `802d73bf` (pushed) | 1 | `europe-west1` Functions instance, `inviteService`, error-to-string mapping (he/en), i18n |
| `ee4b1620` | 2a | `/c/[token]` route + `InvitePreviewScreen`, join request, resume round trip |
| `f163737a` | 2b | Communities you belong to are listed in the chats tab, in both modes |
| `3fa28141` | 2c | Owner's request row shows a derived "professional profile" marker and all roles |
| `2dd36674` | 3 | Owner-only share row on community details |
| `6d92e3de` | 4 | Owner push on a new invite join request |
| `9ffd958c` | 5 | Landing page `/c/<token>` + hosting rewrite (built, not deployed) |

## Decisions applied

- **No pro-only join gate.** Any signed-in user can request; the owner's approval is the gate. The spec's mode-switch confirm and profile redirect were dropped. The owner sees whether the requester has a usable profile (derived: display name + at least one role; **not** `proProfileCompleted`) and all their roles. Zero extra reads: `usePeople` already fetched both docs.
- **Phase 1 only.** `bama://c/<token>`; no associated domains, no intent filters, nothing under `ios/` or `app.json` linking.
- **No `expo-clipboard`.** Native share sheet; web `navigator.share` with `navigator.clipboard` fallback.
- **Owner only** can create a link. `allowMemberInvites` was not added to the client type.
- **`resolveCommunityInvite` is not part of this** and the landing page does not call it.

## The resume round trip (the highest-risk part)

- Only `useSwitchMode` consumed a saved link. A **returning** user with a restored mode skips mode-select after consent, email verification and setup, so the link would have been dropped.
- Fix: `postStepRoute` (`src/features/auth/utils/postStepRoute.ts`) is a second take site, called from `ConsentForm`, `VerifyEmailForm` (2 places) and `setup.tsx`. It consumes the link only when the next stop is a final destination, never when another auth step or mode-select is ahead. With no saved link it returns exactly what `nextAuthRoute` returns. Effects are once-guarded.
- `pendingIntentStore` now refuses `takeResume()` before AsyncStorage hydrates, offers `takeResumeWhenReady()` (3 s cap), and keeps a not-persisted `consumedAt` so a late hydration cannot bring a used link back.
- `/c/[token]` saves the link **before** its redirect renders, and uses `useOnboardingGate({ deferPhone: true })` so the phone rung stays with the group layouts: consent lands on the invite, not the phone screen (tested).
- Every way out of the invite screen goes through `inviteExitHref`, which always names `(client)` or `(professional)` from the active mode (tested for both).

## Verified

- `npx jest`: 360 suites, 3154 tests green; `tsc` clean; `node --test scripts/__tests__/*.test.mjs`: 78 pass.
- Mutation checks at every checkpoint (each asserts its anchor). Two of mine did not bite at first and were fixed: the pre-hydration test, and an invalid mutant that was a syntax error.
- **Emulator, backend (29/29)** against auth + firestore + functions under `demo-bama`: create, create again returns the same invite; **create after revoke mints a new token and a new code** (the old link reads as revoked); lookups; join request through the rules (live token OK; revoked token, short code, extra field, someone else's uid all refused); `useCount` trigger; permission and error mapping on the **real** emulator errors.
- **Emulator, owner push (16/16)**: one notification per new invite request; none for a non-invite request or an edit to a pending one; one more for a re-ask after a rejection; English when `users/{owner}.language` is `en`; no crash and the count still bumps when there is no owner.
- **Hosting emulator**: `/c/**` serves the page with `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`; `/`, `/terms`, `/privacy`, `/refunds`, `/en/*` are unchanged and do not get those headers.
- The harnesses are in the session scratchpad, not committed (`invite-emulator-proof.mjs`, `invite-push-proof.mjs`).

## NOT verified

- **No browser or device check at all.** The Chrome extension was not connected. The invite screen, the share row, the chats-tab community rows, the owner request row and the landing page have not been looked at, in Hebrew RTL or English LTR. Client-mode community rooms (`ChatRoomScreen` under `(client)`) were checked by reading only.
- **Expo push delivery.** The emulator proves the `notifications` document is written; the existing `onNotificationCreate` path turns it into a push, and that was not exercised (no push tokens).
- `resolveCommunityInvite` (public endpoint) is untouched and unverified, as before.
- Composite indexes cannot be proven on the emulator. None were added by this work.

## Things you should know

1. **Owner push language is Hebrew.** The server has no language field (`users/{uid}.language` does not exist; `feeOverdue.ts` says the same). The text is bilingual and switches to English the day that field is written. Only **invite** requests notify; Discover requests still do not. A muted community still sends this push (it is an action the owner must take). There is no per-type opt-out toggle for `community_join_request`.
2. **Client-mode members and the Market channel.** The listing "view" button in a community chat (`ChatRoomScreen.tsx:588`) goes to `/(professional)/(tabs)/marketplace`, and there is no client marketplace. I left it unchanged. Hiding that button in client mode is the obvious follow-up; it is your product call.
3. **Community rows sort by creation date.** The server never writes `lastMessage` on a community chat doc, so a community sits where its `createdAt` puts it and does not rise on new messages. The unread badge works (the server increments `unreadCount.<uid>` too, so my earlier "needs a `channelUnread` sum" was wrong and nothing was needed).
4. **Phone.** The invite preview does not require a phone number; the phone rung applies when the user enters a chat from it. The `joinRequests` rules do not require one either.
5. **`jest.setup.js` is new.** It registers the AsyncStorage jest mock globally, because the persisted store is now reached through the auth screens. Two older community-details tests also needed the invite service mocked.
6. **Emulator noise that is not from this work:** `onUserCreate` crashes under the functions emulator when auth users are created (`admin.firestore.FieldValue` is undefined there; already documented in `docs/slice1-verification.md`). The rules log prints "evaluation error" for some denied writes; denial is the same either way.
7. **Store links:** `config/appLinks` has empty `iosUrl`/`androidUrl`, so the landing page says "install BAMA, then open this link again" with no store button.

## What you need to deploy (you run these)

Rules need **no** deploy: the invite rules (`5fe615c9`) are an ancestor of the last released rules commit `b0fccbc`. `docs/production-deploys.md` warns against casual rules deploys because of the `verified()` drift, so don't.

1. **Seed `config/appLinks` in production** (the link base; `createCommunityInvite` fails without it). Dry run, write, verify:
   ```
   node scripts/seed-app-links.mjs --project bama-af0a0 --dry-run
   node scripts/seed-app-links.mjs --project bama-af0a0
   node scripts/seed-app-links.mjs --project bama-af0a0 --verify
   ```
2. **Functions, by name**, five of them (`resolveCommunityInvite` deliberately excluded). These were still held for the budget-alert confirmation as of 2026-09-25:
   ```
   firebase deploy --only functions:createCommunityInvite,functions:getCommunityInvite,functions:revokeCommunityInvite,functions:onCommunityInviteJoinRequest,functions:onCommunityDeleted --project bama-af0a0
   ```
   `onCommunityInviteJoinRequest` is the one changed here (owner push). Build first: `npm --prefix functions run build`.
3. **Hosting** (builds the site, then deploys; adds `/c.html` and the `/c/**` rewrite):
   ```
   npm run legal:deploy
   ```
4. **App**: JS only. No new native module and no `ios/` or `app.json` change, so nothing here needs a native rebuild. (I did not check whether OTA updates are configured for this project.)

Order: seed `appLinks`, then functions, then hosting, then ship the app. If the app ships before the functions are live, the callable answers "not found" and the owner sees the "This invite link doesn't exist" sentence on the share row, which is misleading; a deploy-order issue, not a code path I handled specially.
