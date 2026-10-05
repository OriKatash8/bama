# Community invite links: status, 2026-10-05 (updated after the review round)

Phase 1 is built and committed. **Nothing is deployed, `config/appLinks` is not seeded in production, and hosting is not deployed.** Everything below was run against local emulators only.

The earlier plan, `2026-10-05-community-invite-links-step1.md`, still contains superseded proposals (the pro-only gate, `hasResume`). This file is the current state.

## Before any hosting deploy (done: legal check, anchor)

**Legal site safety check: no differences.** `npm run legal:build`, then every built file fetched from `https://bama-af0a0.web.app` and compared by SHA-256: `index`, `terms`, `privacy`, `refunds`, `en/terms`, `en/privacy`, `en/refunds`, `logo.webp`, both favicons and the apple-touch-icon are **byte-identical** (11 of 11). The built file list equals the list in `.firebase/hosting.*.cache` (the last deploy from this machine) plus exactly one new file, `c.html`; there is no `app-links.json`. What the deploy would add: `c.html`, the `/c/**` rewrite, and header rules for `/c/**` and `/app-links.json`. The existing header rule is unchanged. A caveat I cannot remove: the live file list cannot be enumerated without credentials, so a file that is live but absent from this machine's last-deploy list would be dropped by the deploy (a hosting deploy publishes exactly the local folder). Nothing suggests there is one.

**The "open in app" action is a real anchor the user taps.** `<a id="open" class="open" href="#">` inside the valid-link section. The page script reads `location.pathname` (the only use of `location`), validates the token, and calls `setAttribute('href', 'bama://c/<token>')` on that anchor. There is no redirect, no `window.location` / `location.href` assignment, no `window.open`, no `.click()`, no timer, no meta refresh and no inline handler; nothing is attempted on page load. Tests lock this in (including a `location` that records every write and sees none), and four deliberate regressions each fail them. Under the button, always visible, in Hebrew and English: *if nothing happened, open this page in Safari or Chrome (from the menu of the app you opened the link in)*.

**Known limit of phase 1: `bama://` is unreliable inside the WhatsApp in-app browser.** Custom-scheme links are often refused there, silently. The tap-anchor and the fallback line make the failure recoverable, but they do not fix it. **Universal links on a real domain are the actual fix.**

## Step 14 (universal links): waiting for the domain

You are buying a real domain. Once it exists, associated domains, Android intent filters, the AASA file and `assetlinks.json` ride the **pre-launch native build you need anyway for the Heebo fix**, not a separate build. Not started; waiting for the domain. Switching the link base is a single `config/appLinks.baseUrl` edit (plus `--force`/`--verify` on the seed script).

## Queued, NOT started

- **(a) Push cooldown** (closes the cancel-and-re-request spam risk). My pick and why, below.
- **(b) Missing emulator states** for the invite preview: a community with no `photoURL`, no description, and the loading and error states. (A null `photoURL` is the classic crash; the no-photo case was seen, the other combinations were not.)
- **(c) Rename the fixture's test password** to something self-evidently non-secret (read from an env var with a default like `emulator-only-not-a-secret`) with a one-line comment that it only works against the emulator.

**My pick for (a): a server-only cooldown stamp, not the two options as stated.** Both of the cheaper ideas fail against exactly the case that matters. The rules let a requester delete their pending request and create a new one, so a stamp on the request doc (`notifiedAt`) is deleted with it, and "notify only if no prior request doc existed" is true again after the delete. The second also goes silent for a legitimate re-ask after a rejection. What survives a delete is a record the requester cannot touch: `chats/{chatId}/joinRequestNotices/{uid}` with `lastNotifiedAt`, written only by the trigger (the rules deny everything not listed, so no rule change). The trigger notifies when there is no stamp or it is older than the cooldown (I would start at 1 hour, a constant), and records the time in the same transaction as the check. Cost: one read and one write per new request. Trade-off: a genuine re-ask inside the cooldown is silent, which is right (the owner was just told). Small loose end: those docs are orphaned when a community is deleted unless the delete path removes them.

## What changed in the review round

- **"View listing" is hidden when `activeMode === 'client'`.** The card and its content stay; only the action goes, because it opens the professional marketplace and there is no client one (`SharedListingCard` in `ChatRoomScreen.tsx`, test in `sharedListingCardAction.test.tsx`). Looked at in a browser as a client (no button) and as a professional (button).
- **The owner push now fires for every new join request**, invite or not. The only reason I could find to keep the filter was spam, see "Risks" below; it is not a reason to keep it.
- **The landing page says the truth when the app is not in the stores**, and shows store buttons by itself once the store links are seeded. See "Store links".
- **Pushed to `origin/main`.** See the list at the end.

## Open product question

**Should clients get marketplace access?** Today a client-mode community member can open the Market channel and see shared listings, but cannot open them. If the answer is yes, it needs a client marketplace route; I built nothing for it.

## Store links (landing page)

The static page cannot read Firestore (`config/*` is for signed-in users only), so:

1. `node scripts/seed-app-links.mjs --project bama-af0a0 --ios-url <https url> --android-url <https url>` sets only those two fields of the existing doc (no `--force`, `baseUrl` untouched; refuses anything that is not `https`).
2. `npm run legal:deploy` now first runs `scripts/export-app-links.mjs --optional`, which writes `legal-site/static/app-links.json` (only the two URLs, gitignored), then builds and deploys. The page fetches `/app-links.json` from its own origin.
3. With no links, an empty file, a missing file or any error, the page says in Hebrew and English that the app is not in the stores yet. With links it shows the matching buttons. No page edit is needed.

`legal:deploy` does not fail if the export cannot run (no Google credentials, no doc): it prints a loud warning, deletes any older `app-links.json` so a stale one never ships, and deploys with the "not in the stores yet" message. The export reads production through Application Default Credentials, like `seed-app-links.mjs`.

## The resume round trip

- A **returning** user with a restored mode skips mode-select after consent, email verification and setup, so the saved link would have been dropped. `postStepRoute` (`src/features/auth/utils/postStepRoute.ts`) is a second take site, called from `ConsentForm`, `VerifyEmailForm` (2 places) and `setup.tsx`. It consumes the link only when the next stop is a final destination; with no saved link it returns exactly what `nextAuthRoute` returns. Effects are once-guarded.
- `pendingIntentStore` refuses `takeResume()` before AsyncStorage hydrates, has `takeResumeWhenReady()` (3 s cap), and a not-persisted `consumedAt` so a late hydration cannot bring a used link back.
- `/c/[token]` saves the link **before** its redirect renders, and uses `useOnboardingGate({ deferPhone: true })`, so consent lands on the invite, not the phone screen.
- Every way out of the invite screen goes through `inviteExitHref`, which always names `(client)` or `(professional)`.

## Run it locally (cold start)

All emulator-only. The fixture **wipes** the emulator's data and refuses to run against anything that is not a local `demo-` project.

```bash
cd ~/dev/bama-app

# 1. Build the functions the emulator loads.
npm --prefix functions run build

# 2. Terminal 1: the emulators (auth, firestore, functions). Leave running.
firebase emulators:start --only auth,firestore,functions --project demo-bama

# 3. Terminal 2: seed everything and mint the links. This also seeds config/appLinks
#    (validated by the same rule createCommunityInvite enforces) and creates the invites
#    through the REAL createCommunityInvite / revokeCommunityInvite callables.
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node --no-warnings scripts/dev-invite-fixture.mjs --app-url http://localhost:8081

# 4. Terminal 3: the app, pointed at the emulators (set on the command line; no .env file).
#    Stop your current Metro on 8081 first, or add `--port 8089` and use that port in step 3.
EXPO_PUBLIC_USE_EMULATORS=1 npx expo start --web --clear
```

The fixture prints, every run (the token is different each time):

```
Log in with any of these, password: Invite-test-1
  owner@invite.test      owns the community (use professional mode)
  member@invite.test     already a member of it
  client@invite.test     no professional profile (a plain requester)
  pro@invite.test        has a professional profile with two roles
  nophone@invite.test    no phone number on file (phone rung comes after the invite)

  live token      http://localhost:8081/c/<22-char token>      <- paste this one
  live short code http://localhost:8081/c/<6-char code>
  REVOKED token   http://localhost:8081/c/<22-char token>
  unknown code    http://localhost:8081/c/ZZZZZZ
  malformed       http://localhost:8081/c/not-a-token
  Deep-link form: bama://c/<token>
```

**The URL to paste: `http://localhost:8081/c/<live token>`**, taken from the fixture's output. Open it signed out first (it should send you to login, and after login and picking a mode bring you back to the invite), then again signed in. To mint another link later, sign in as the owner and tap "Share community" on the community's details page (on web it copies the link), or rerun the fixture (it wipes and starts over). To seed `config/appLinks` on its own: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --no-warnings scripts/seed-app-links.mjs --project demo-bama`.

**iPhone:** the emulators must be reachable from the phone, and `127.0.0.1` is the phone itself. Use the LAN config and your computer's address:

```bash
firebase emulators:start --only auth,firestore,functions --project demo-bama --config firebase.emulators-lan.json
EXPO_PUBLIC_USE_EMULATORS=1 EXPO_PUBLIC_EMULATOR_HOST=$(ipconfig getifaddr en0) npx expo start --dev-client
```

Open the invite on the phone with the deep-link form `bama://c/<token>` (paste it in Notes or Safari and tap it). While `firebase.emulators-lan.json` runs, anyone on the Wi-Fi can reach the emulators. **I did not try the phone setup**, see below.

**The landing page locally:**

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --no-warnings scripts/export-app-links.mjs --project demo-bama
node scripts/build-legal-site.mjs
# a hosting emulator with a config INSIDE the project folder (an absolute `public` path from elsewhere served only 404s):
#   copy firebase.json's "hosting" block into a temp file next to it, set "emulators": {"hosting":{"port":5055},"hub":{"port":4410},"ui":{"enabled":false},"logging":{"port":4510}}
firebase emulators:start --only hosting --project demo-bama --config <that file>
# then http://127.0.0.1:5055/c/<token>
```

## What I looked at, and what I did not

I drove the app in **headless Chromium (Playwright), 390×844 at 2x, against the emulators**, and read the screenshots. That is a web check. I have not seen any of this on an iPhone, in Safari, in Android, or in dark mode.

**Screen by screen: looked at**

| Screen | Seen |
|---|---|
| Invite preview `/c/<token>` | Hebrew as a client (invite, then request sent); English as a professional (invite, then request sent); revoked, unknown code and malformed link in English |
| Resume round trip | Brand-new browser session: open link signed out, redirected to login, log in, mode-select, pick a mode, land on the invite. Client mode and professional mode |
| Chats tab, community row | Hebrew, in professional mode (owner) and in client mode (the approved client) |
| Community room as a client | Opens, channels, Market channel selected, composer in the client colour |
| Community details, "Share community" | Hebrew and English label; tap on web: link copied to the clipboard (it was the real live URL), green "copied" toast |
| Owner dashboard, join-request rows | Hebrew: requester with no profile ("אין עדיין פרופיל מקצועי"); English: requester with a profile ("Editor, Videographer" + "Professional profile"); approve removes the row |
| Shared listing card in the Market channel | Hebrew: client sees the card, no button; professional sees the button |
| Landing page `/c/<token>` | Three store states (both buttons, none seeded, no file) and a bad link, in the Hosting emulator |

**Built but NOT looked at, or looked at only in part: read these critically**

- **Invite preview.** The loading state; the error state with "Try again" (a real backend error, e.g. unverified email or rate limit); the "already a member" state and its "Open community" button; a community **with a photo** (only the no-photo icon was seen); a long name or long description; the English description; **dark mode**; **native iOS** layout (safe area, notch, keyboard). Its "returning to the app" button after a request was seen only as text.
- **Resume round trip.** The **returning-user path** (restored mode, mode-select skipped after consent / email / setup) is covered by unit tests only, not clicked through. Not clicked: register, email-verify and setup chains; Google and Apple sign-in; opening `bama://c/<token>` from a cold start on a device.
- **The phone-number ordering.** `nophone@invite.test` exists in the fixture but I did not run that path in the browser.
- **Chats tab.** English; the unread badge on a community row; searching for a community; the empty state for a user whose only chat is a community (unit-tested).
- **Share row.** The **native share sheet** (`Share.share`) is the biggest unknown: I have only seen the web clipboard fallback. The unverified-email toast and the busy spinner in a browser; the English layout beyond the label.
- **Owner dashboard.** Two-column layout at 900px and wider; a long name; the row's collapse animation (the row did disappear).
- **Listing card.** English; a rental listing; a listing with a photo; **tapping** the professional button.
- **Owner push.** Receiving one on a phone, its text on a lock screen, and tapping it (the tap routing is unit-tested). The emulator proves the `notifications` document is written once; the existing `onNotificationCreate` turns it into an Expo push and that step was never run.
- **Landing page.** Safari on iOS and Chrome on Android; what the "Open in the app" button does on a phone **without** the app (iOS shows an error for an unhandled scheme); **dark mode**; and especially **in-app browsers such as WhatsApp's**, which often refuse custom-scheme links like `bama://`. This is the real WhatsApp use case and I could not test it; you are about to. If it fails there, the fallback line is the manual route and universal links on the real domain are the fix.
- **The iPhone emulator setup itself** (LAN config, `EXPO_PUBLIC_EMULATOR_HOST`): untested. iOS may also object to plain-http calls to a LAN address from the dev build.

## Verified by tests

- `npx jest`: 361 suites, 3157 tests green; `tsc` clean; `node --test scripts/__tests__/*.test.mjs`: 94 pass.
- Mutation checks at every step, each asserting its anchor. Two of mine did not bite at first (a pre-hydration test; an invalid mutant) and were fixed. One more survived because two checks overlapped, so I confirmed removing both fails.
- **Emulator, backend (29/29):** create; create again returns the same invite; **create after revoke mints a new token and code**; lookups; join request through the rules (live token OK, revoked token / short code / extra field / someone else's uid refused); the real emulator errors mapped to the right strings.
- **Emulator, owner push (20/20):** one notification per new request, **invite or not**; none for an edit to a pending request or a cancel; one more for a re-ask after a rejection; English when `users/{owner}.language` is `en`; no crash and the count still bumps when there is no owner.
- The harness scripts are in the session scratchpad and are not committed; the committed ones are `scripts/dev-invite-fixture.mjs` (guarded by `devFixtureGuard.test.mjs`) and `scripts/export-app-links.mjs`.

## Risks and logged-not-fixed

- **Owner push can be spammed.** A requester can cancel and ask again as often as they like (the rules allow deleting a pending request and creating a new one), and each new pending request pushes the owner. Same for invite requests before this change. No cap or per-requester cooldown exists. Worth a cooldown if it matters.
- **Owner push is Hebrew.** The server has no language field (`users/{uid}.language` does not exist), so every push is Hebrew. The text is bilingual and switches the day the app writes that field. *Logged, not fixed.*
- **Community rows do not sort by their last message.** The server never writes `lastMessage` on a community chat doc, so rows sit by creation date. The unread badge works (the server increments `unreadCount.<uid>`). *Pre-existing; logged, not fixed.*
- A muted community still sends this push, and there is no per-type opt-out toggle for `community_join_request`.
- The invite preview does not require a phone number; the phone rung applies when the user enters a chat from it. The `joinRequests` rules do not require one either.
- `jest.setup.js` is new (a global AsyncStorage mock, because the persisted store is now reached through the auth screens).
- Emulator noise that is not from this work: `onUserCreate` crashes under the functions emulator when auth users are created (`admin.firestore.FieldValue` is undefined there, already in `docs/slice1-verification.md`); the rules log prints "evaluation error" for some denied writes (denied either way); a browser logs a 404 for `/app-links.json` when no file was deployed.

## What you run to deploy (I have not)

Rules need **no** deploy: the invite rules (`5fe615c9`) are an ancestor of the last released rules commit `b0fccbc`. `docs/production-deploys.md` warns against casual rules deploys because of the `verified()` drift, so don't.

1. **Seed `config/appLinks` in production** (the link base; `createCommunityInvite` fails without it):
   ```
   node scripts/seed-app-links.mjs --project bama-af0a0 --dry-run
   node scripts/seed-app-links.mjs --project bama-af0a0
   node scripts/seed-app-links.mjs --project bama-af0a0 --verify
   ```
2. **Functions, by name**, five of them (`resolveCommunityInvite` deliberately excluded). They were still held for the budget-alert confirmation as of 2026-09-25:
   ```
   npm --prefix functions run build
   firebase deploy --only functions:createCommunityInvite,functions:getCommunityInvite,functions:revokeCommunityInvite,functions:onCommunityInviteJoinRequest,functions:onCommunityDeleted --project bama-af0a0
   ```
   `onCommunityInviteJoinRequest` is the one changed here (owner push, now for every request).
3. **Hosting** (exports the store links if it can, builds, deploys; adds `/c.html`, the `/c/**` rewrite and the `/app-links.json` header):
   ```
   npm run legal:deploy
   ```
   Later, once the app is in the stores: seed the two links (see "Store links"), then run the same command again.
4. **App:** JS only. No new native module and no `ios/` or `app.json` change, so nothing here needs a native rebuild. (I did not check whether OTA updates are configured.)

Order: seed `appLinks`, then functions, then hosting, then ship the app. If the app ships before the functions are live, the callable answers "not found" and the owner sees "This invite link doesn't exist" on the share row; misleading, but a deploy-order issue.

## Commits

`802d73bf` → `ee4b1620` → `f163737a` → `3fa28141` → `2dd36674` → `6d92e3de` → `9ffd958c` → `d66491f4`, then this round (listing button, push for every request, landing page + store links, dev emulator switch / fixture / LAN config).
