# Community invite links: status, 2026-10-05 (updated: link card, push cooldown, empty states)

Phase 1 is built and committed. **Nothing is deployed, `config/appLinks` is not seeded in production, and hosting is not deployed.** Everything below was run against local emulators only.

The earlier plan, `2026-10-05-community-invite-links-step1.md`, still contains superseded proposals (the pro-only gate, `hasResume`). This file is the current state.

## Before any hosting deploy (done: legal check, anchor)

**Legal site safety check: no differences.** `npm run legal:build`, then every built file fetched from `https://bama-af0a0.web.app` and compared by SHA-256: `index`, `terms`, `privacy`, `refunds`, `en/terms`, `en/privacy`, `en/refunds`, `logo.webp`, both favicons and the apple-touch-icon are **byte-identical** (11 of 11). The built file list equals the list in `.firebase/hosting.*.cache` (the last deploy from this machine) plus exactly one new file, `c.html`; there is no `app-links.json`. What the deploy would add: `c.html`, the `/c/**` rewrite, and header rules for `/c/**` and `/app-links.json`. The existing header rule is unchanged. A caveat I cannot remove: the live file list cannot be enumerated without credentials, so a file that is live but absent from this machine's last-deploy list would be dropped by the deploy (a hosting deploy publishes exactly the local folder). Nothing suggests there is one.

**The "open in app" action is a real anchor the user taps.** `<a id="open" class="open" href="#">` inside the valid-link section. The page script reads `location.pathname` (the only use of `location`), validates the token, and calls `setAttribute('href', 'bama://c/<token>')` on that anchor. There is no redirect, no `window.location` / `location.href` assignment, no `window.open`, no `.click()`, no timer, no meta refresh and no inline handler; nothing is attempted on page load. Tests lock this in (including a `location` that records every write and sees none), and four deliberate regressions each fail them. Under the button, always visible, in Hebrew and English: *if nothing happened, open this page in Safari or Chrome (from the menu of the app you opened the link in)*.

**Verified on iOS by you:** the `/c/**` rewrite works in production (on a preview channel), and tapping "open in app" from inside WhatsApp's in-app browser handed off to the app. **Android is untested.** So the tap-anchor works where it was tried, and universal links on the real domain are now polish rather than a dependency. The caveat that remains: custom-scheme links are refused by some in-app browsers (and can fail silently), which is what the always-visible fallback line is for.

## Step 14 (universal links): waiting for the domain

You are buying a real domain. Once it exists, associated domains, Android intent filters, the AASA file and `assetlinks.json` ride the **pre-launch native build you need anyway for the Heebo fix**, not a separate build. Not started; waiting for the domain. Switching the link base is a single `config/appLinks.baseUrl` edit (plus `--force`/`--verify` on the seed script).

## This round: link card, push cooldown, empty states, password

### Link-preview card (WhatsApp, Telegram, iMessage, X)

A pasted bare URL reads as phishing, so the landing page now carries `og:` and `twitter:` tags: `og:type`, `og:site_name`, `og:locale` (he_IL, alternate en_US), `og:title`, `og:description`, `og:url`, `og:image` (+ type, width, height, alt) and `twitter:card` (`summary_large_image`), `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt`. Hebrew title ("הוזמנת להצטרף לקהילה ב-BAMA"), description in Hebrew with the English after a dot. **Generic by necessity**: scrapers do not run JavaScript, so one card serves every invite and cannot name the community until phase 2 (a server-rendered page).

- **The image** is `legal-site/static/og-invite.png`: 1200×630 (the 1.91:1 preview shape), 44 KB, the BAMA wordmark from `logo.webp` centred on the app's gradient. A PNG on purpose: WhatsApp does not reliably render WebP, and the wordmark is transparent so it needs a background of ours. Regenerate with `python3 scripts/make-invite-og-image.py` (Pillow).
- **Absolute URLs** (`og:image`, `og:url`, `twitter:image`) are filled in at build time from one constant, `SITE_ORIGIN` in `scripts/build-legal-site.mjs` (default `https://bama-af0a0.web.app`; or `SITE_ORIGIN=https://... npm run legal:build`). The source `c.html` holds a `{{SITE_ORIGIN}}` placeholder. **When the real domain arrives, this is one of the places to change** (the others: `config/appLinks.baseUrl`, step 14). A value that is not a bare `https` origin fails the build.
- **Tested** against the built page: every required tag, absolute https URLs, no placeholder left, the PNG signature and its real dimensions matching the declared ones, under 300 KB, tags within the first 5 KB, a different origin flowing through every URL, a bad origin failing the build. Six deliberate regressions each fail the tests. Fetched through the Hosting emulator with the WhatsApp, Facebook, Telegram and Twitter user agents: all four receive the tags, and the image is served as `image/png`.
- **Not verified: WhatsApp actually drawing the card.** That is yours to see.
- **Two things that will catch you when you test it.** (1) The image URL is absolute and points at the production origin, so **on a preview-channel URL the image will 404** (the live site does not have `og-invite.png` yet) and the card will have no picture. To see the real card before going live, deploy once to the channel, take the URL it prints, then `SITE_ORIGIN=<that url> npm run legal:build` and redeploy to the same channel. (2) **WhatsApp caches a preview per URL**, so a link you already pasted will not update; use a link you have not pasted before (any well-formed token works for the page itself).

### Owner-push cooldown (closes the spam risk)

My pick, as discussed: a record the requester cannot touch, not a stamp on the request (which is deleted when they cancel).

- `chats/{chatId}/joinRequestNotices/{uid}` holds `lastNotifiedAt`, written only by the trigger. **Rules check:** the only wildcards in `firestore.rules` are the final `/{document=**}` deny-all and a collection-group rule for subcollections named `fees`; nothing under `chats/{chatId}` is a wildcard, so the new subcollection is denied by default like `memberStats`. A test pins that (no rule names it, only those two wildcards exist, the deny-all is last); two deliberate violations each fail it. In the emulator, no client can read, write, delete or list it, **including the community owner**.
- The announce step (`functions/src/communities/joinRequestAnnounce.ts`) does everything in **one transaction**: read the stamp and this event's notification, then write both. Within 1 hour of the last notification for that requester and community it stays silent. The window is the constant `JOIN_REQUEST_NOTIFY_COOLDOWN_MS`.
- **The transactional stamp also makes the trigger idempotent against at-least-once duplicate delivery.** The notification's id is derived from the event id, and the transaction checks for it first, so a redelivered copy of the same event is a no-op **even hours later, long after the cooldown** (without that check the late copy crashes with `ALREADY_EXISTS`). And because the check and the write are one transaction, **five simultaneous events for one requester let exactly one through**. I ran the real compiled function directly against the emulator for this (17/17), since a redelivered event cannot be provoked through the emulator; removing the transaction, the "already announced" check, or the cooldown check each fails it.
- Through the real triggers (34/34): cancel and re-ask three times in a row, plus a re-ask after a rejection, leave exactly **one** notification for that requester; with the stamp aged to two hours the next re-ask notifies and moves the stamp; the invite's `useCount` still counts every request (it is not behind the cooldown).
- `onCommunityDeleted` now also removes the stamps (verified: three stamps gone after deleting the community).
- **Trade-off:** a genuine re-ask inside the hour, even after the owner rejected the first, is silent, because the owner was just told. The owner still sees it on the dashboard.

### Invite preview with missing details (checked in the app, not only in unit tests)

Against the emulators, in the real app, as a signed-in client, with three new fixture communities: **no photo and no description (fields absent)**, **same with explicit `null`s**, and **one with a photo** (a data URI). All three render the name, the placeholder icon (or the photo), the join button and the note, with **no page errors**; no description line is drawn when there is none. The **loading state** (the lookup held back 4 s) shows the spinner and "Opening invite…" then the preview. The **error states** were produced by making the callable answer with a failure: `demo-isolation`, rate-limited, signed-out, a 500 carrying a stack-trace-looking message, and an aborted request each show their own Hebrew sentence and **never** the raw server text, and **Try again recovers**. The **already-a-member** state shows "Open community", which lands in the room. Unit tests cover the same cases (null / absent / empty photo and description, empty name).

Two cosmetic things I saw and left alone: an aborted request (offline) reads "משהו השתבש" rather than "no connection", because the Firebase SDK reports it as `internal`; and the permanent errors (`demo-isolation`, not allowed) still offer "Try again".

### Fixture password

Now `process.env.FIXTURE_PASSWORD ?? 'emulator-only-not-a-secret'`, with a comment that these accounts exist only in the local Auth emulator. Checked on the emulator: the default signs in, the old password is rejected, the override works. Nothing else in the repo used the old value.

## What changed in the review round

- **"View listing" is hidden when `activeMode === 'client'`.** The card and its content stay; only the action goes, because it opens the professional marketplace and there is no client one (`SharedListingCard` in `ChatRoomScreen.tsx`, test in `sharedListingCardAction.test.tsx`). Looked at in a browser as a client (no button) and as a professional (button).
- **The owner push now fires for every new join request**, invite or not (and, as of this round, at most once per requester per community per hour, see above).
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
Log in with any of these, password: emulator-only-not-a-secret   (override with FIXTURE_PASSWORD)
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
| Invite preview `/c/<token>` | Hebrew as a client (invite, then request sent); English as a professional (invite, then request sent); revoked, unknown code and malformed link in English; **no photo / no description (absent and null), with a photo, loading, five error states with Try again, and already-a-member** (Hebrew) |
| Resume round trip | Brand-new browser session: open link signed out, redirected to login, log in, mode-select, pick a mode, land on the invite. Client mode and professional mode |
| Chats tab, community row | Hebrew, in professional mode (owner) and in client mode (the approved client) |
| Community room as a client | Opens, channels, Market channel selected, composer in the client colour |
| Community details, "Share community" | Hebrew and English label; tap on web: link copied to the clipboard (it was the real live URL), green "copied" toast |
| Owner dashboard, join-request rows | Hebrew: requester with no profile ("אין עדיין פרופיל מקצועי"); English: requester with a profile ("Editor, Videographer" + "Professional profile"); approve removes the row |
| Shared listing card in the Market channel | Hebrew: client sees the card, no button; professional sees the button |
| Landing page `/c/<token>` | Three store states (both buttons, none seeded, no file) and a bad link, in the Hosting emulator |

**Built but NOT looked at, or looked at only in part: read these critically**

- **Invite preview.** A long name or long description; the new states in English; **dark mode**; **native iOS** layout (safe area, notch, keyboard). Its "back to the app" button after a request was seen only as text.
- **Resume round trip.** The **returning-user path** (restored mode, mode-select skipped after consent / email / setup) is covered by unit tests only, not clicked through. Not clicked: register, email-verify and setup chains; Google and Apple sign-in; opening `bama://c/<token>` from a cold start on a device.
- **The phone-number ordering.** `nophone@invite.test` exists in the fixture but I did not run that path in the browser.
- **Chats tab.** English; the unread badge on a community row; searching for a community; the empty state for a user whose only chat is a community (unit-tested).
- **Share row.** The **native share sheet** (`Share.share`) is the biggest unknown: I have only seen the web clipboard fallback. The unverified-email toast and the busy spinner in a browser; the English layout beyond the label.
- **Owner dashboard.** Two-column layout at 900px and wider; a long name; the row's collapse animation (the row did disappear).
- **Listing card.** English; a rental listing; a listing with a photo; **tapping** the professional button.
- **Owner push.** Receiving one on a phone, its text on a lock screen, and tapping it (the tap routing is unit-tested). The emulator proves the `notifications` document is written once; the existing `onNotificationCreate` turns it into an Expo push and that step was never run.
- **Landing page.** **Android** (Chrome and WhatsApp's in-app browser); what "Open in the app" does on a phone **without** the app (iOS shows an error for an unhandled scheme); **dark mode**; and the **link-preview card as WhatsApp draws it**. The iOS WhatsApp handoff you tested yourself.
- **The iPhone emulator setup itself** (LAN config, `EXPO_PUBLIC_EMULATOR_HOST`): untested. iOS may also object to plain-http calls to a LAN address from the dev build.

## Verified by tests

- `npx jest`: 362 suites, 3175 tests green; `tsc` clean; `node --test scripts/__tests__/*.test.mjs`: 106 pass.
- Mutation checks at every step, each asserting its anchor. Two of mine did not bite at first (a pre-hydration test; an invalid mutant) and were fixed. One more survived because two checks overlapped, so I confirmed removing both fails.
- **Emulator, backend (29/29):** create; create again returns the same invite; **create after revoke mints a new token and code**; lookups; join request through the rules (live token OK, revoked token / short code / extra field / someone else's uid refused); the real emulator errors mapped to the right strings.
- **Emulator, owner push (34/34):** one notification per new request, **invite or not**; none for an edit to a pending request or a cancel; **the 1-hour cooldown** (re-ask and repeated cancel-and-re-ask are silent; notifies again once the stamp is older than an hour); the stamp is unreachable to any client, the owner included; English when `users/{owner}.language` is `en`; no crash and the count still bumps when there is no owner; the stamps are removed when the community is deleted.
- **Emulator, announce step run directly (17/17):** duplicate and late redelivery of one event, the cooldown boundary to the millisecond, a second requester unaffected, five concurrent events letting one through, no-owner / owner-asks-themselves / missing community.
- The harness scripts are in the session scratchpad and are not committed; the committed ones are `scripts/dev-invite-fixture.mjs` (guarded by `devFixtureGuard.test.mjs`) and `scripts/export-app-links.mjs`.

## Risks and logged-not-fixed

- **Owner push spam: closed** by the cooldown above. Residual: a requester can still create a request every hour per community, and the cooldown is per requester, so many different accounts each get one push.
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
   Two of these changed here: `onCommunityInviteJoinRequest` (owner push for every request, with the cooldown) and `onCommunityDeleted` (removes the cooldown stamps). No rules or index change.
3. **Hosting.** The hosting-only command that skips the store-link export (no production config is read), and which now also ships `og-invite.png`:
   ```
   cd ~/dev/bama-app && npm run legal:build && firebase deploy --only hosting --project bama-af0a0
   ```
   `npm run legal:deploy` does the same plus the best-effort store-link export (it reads `config/appLinks` through your Google credentials). To see the link card on a **preview channel** first, see "Two things that will catch you" above.
   Later, once the app is in the stores: seed the two links (see "Store links"), then run the same command again.
4. **App:** JS only. No new native module and no `ios/` or `app.json` change, so nothing here needs a native rebuild. (I did not check whether OTA updates are configured.)

Order: seed `appLinks`, then functions, then hosting, then ship the app. If the app ships before the functions are live, the callable answers "not found" and the owner sees "This invite link doesn't exist" on the share row; misleading, but a deploy-order issue.

## Commits

`802d73bf` → `ee4b1620` → `f163737a` → `3fa28141` → `2dd36674` → `6d92e3de` → `9ffd958c` → `d66491f4` → `7b2c85e9` (listing button) → `96b1241d` (push for every request) → `b1b98748` (store links) → `6f092666` (emulator mode, fixture, LAN config) → `f342bcb7` → `41dc5fe2` → `30608720` (fallback line) → `a233cfa6` (link card) → `8355805b` (push cooldown) → `623e2301` (empty states) → `4512731c` (fixture password) → this doc.
