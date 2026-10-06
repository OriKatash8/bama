# Community invite links: status, 2026-10-05 (updated: link card, push cooldown, empty states)

Phase 1 is built and committed. **I have deployed nothing**: the new hosting files are not live, `config/appLinks` is not seeded in production, and the 2026-10-05 function changes are not live. Everything I ran was against local emulators, plus read-only checks of production.

**Correction (2026-10-06): the invite functions are already live, in their old form.** See "Pre-deploy conditions, and what is actually live" just below. The deploy plan in this file is written around that.

The earlier plan, `2026-10-05-community-invite-links-step1.md`, still contains superseded proposals (the pro-only gate, `hasResume`). This file is the current state.

## Pre-deploy conditions, and what is actually live (2026-10-06)

Recorded in `docs/production-deploys.md` (section "Community-invite functions: the hold, its conditions, and what is actually live") so the repo has the answer instead of an inference.

**The three conditions are met:** TTL on `rateLimits.expireAt` is ACTIVE (I verified it with `gcloud` read-only); the billing budget alert (₪25/month, 50/90/100 % to your email, live 2026-10-06) is recorded from your statement, because I **cannot** read it (the Budget API is not enabled on the project and I did not enable it); the Monitoring policy `BAMA function spike` exists, is enabled and has one notification channel (verified).

**Things that do not match what we assumed:**

1. **The hold was already bypassed.** The audit log shows all six invite functions (the five plus `resolveCommunityInvite`) **created 2026-09-30 21:15 UTC** under your account and updated 2026-10-01 and 2026-10-03. Nothing recorded it. `callClaude` is live too, though the drift allowlist says it is not.
2. **They run the 2026-09-26 code.** The live `onCommunityInviteJoinRequest` source is byte-identical to the repo at `11f783a3`. None of the 2026-10-05 work (owner push for every request, 1-hour cooldown, stamp cleanup) is live. So the functions step below is an **update of five live functions**, not a first deploy.
3. **`resolveCommunityInvite` is live**, a public unauthenticated endpoint, since 2026-09-30. **Decided: delete it** (step 3a below); it is redeployed when phase 2 needs it. It had **zero** requests of any kind in 30 days.
4. **`config/appLinks` does not exist in production**, so `createCommunityInvite` currently fails with `failed-precondition`.
5. **The Monitoring threshold was per second**, so 300 would never have fired. **Decided: 5 per second.** It is sane: the busiest 5-minute window any function had in 7 days was 0.26 per second, so 5 is about 19 times that; the policy does cover the 2nd-gen invite functions. Numbers and the trade-off are in the deploy log.
6. **"Four callables and two triggers":** the code has **three callables** (`createCommunityInvite`, `getCommunityInvite`, `revokeCommunityInvite`) and **two triggers** (`onCommunityInviteJoinRequest`, `onCommunityDeleted`), so five functions. `resolveCommunityInvite` is a plain HTTP endpoint, not a callable. I did not invent a fourth.
7. The "Held back on purpose" section of the deploy log (email verification) is also out of date: the rules with `verified()` are live (released 2026-10-03). I added a correction note and did not delete it.

**Observed, not expected: use of the six functions since 2026-09-30.** Not zero. `createCommunityInvite` was called **12 times** (all HTTP 400) and `getCommunityInvite` **3 times** (all 200), all on 2026-10-05 between 18:39 and 21:25 your time, all from the native iOS app: your phone. The two triggers fired 41 and 97 times on 10-02/10-03 (every join request and chat deletion; consistent with the demo seeding), with nothing at warning level or above. `revokeCommunityInvite` and `resolveCommunityInvite`: **0**. `rateLimits` holds 0 documents (the TTL sweeps them; "never written" cannot be told apart from "written and swept"), and there are 0 invites, 0 invite codes and 0 owner-push notifications. No external caller was seen. Table and detail in the deploy log.

**`callClaude`: decided, delete (step 3b).** The 09-30 blanket deploy resurrected a function that had been deliberately deleted on 2026-09-26, which settles it. It is redeployed when a screen actually calls it. What it was: a public callable running one of three fixed prompts on Anthropic's Haiku with the platform's key; it requires sign-in and a verified email and limits each account to 10 a minute and 60 a day; the key is in Secret Manager (`CLAUDE_API_KEY`, bound at version 3; I read metadata only). **Nothing calls it** (no screen imports the three hooks). In the 30-day logs it was called 4 times, all before the deletion, and never since re-creation. The live code is the hardened HEAD version.

**There was no cost tripwire on it at all.** The Google Cloud budget alert and the Monitoring policy watch Google Cloud spend and function executions; **neither covers Anthropic spend**, which is billed by Anthropic against the key. From Google's side nothing would have fired however much it spent. Whether an Anthropic-side spending limit exists is not recorded anywhere I can see. **Deleting the function does not delete the secret or disable its key versions**: all three versions of `CLAUDE_API_KEY` are still enabled. Disabling 1 and 2 (the superseded ones) is a separate, reversible step, not part of the numbered list: `gcloud secrets versions disable 1 --secret=CLAUDE_API_KEY --project bama-af0a0` (and `2`; `enable` undoes it).

## `getCommunityInvite` returns for a missing or revoked invite; it does not throw

Read in the source and in the **live** source (same shape), and checked in the browser earlier. For a missing invite it returns **HTTP 200 with `{ exists: false }`**; for a revoked one **200 with `{ exists: true, revoked: true }`**. It throws an `HttpsError` only for: not signed in (`unauthenticated`), over the per-account rate limit (`resource-exhausted`), a demo/real mismatch (`failed-precondition`, `demo-isolation`), and an unexpected server fault. "Missing" is also what you get for a token that exists but whose community was deleted or is not a community. **So the three production 200s were most likely `{ exists: false }`, and your phone showed "Invite not found"** (the response bodies are not logged, so this is an inference from the code and the 0 invites).

**The client does not try to render a community that does not exist.** `InvitePreviewScreen` branches on the payload: `!exists` goes to its own "Invite not found" state, `revoked` to "Invite cancelled", and only a real, live invite reaches the preview. Both were driven in the real app against the emulator (an unknown code and a revoked token). The five Hebrew **error** states are for the cases that really throw (signed out, rate limit, demo mismatch, a server or network fault); they fire in production for those. They were driven by making the callable fail, since a normal missing invite does not. One more fact: invites never expire; `expiresAt` is written as `null` and nothing reads it.

## The drift check now covers functions (the real finding)

The 2026-09-30 deploy created seven functions held back on purpose and nothing noticed for a week, because the check only compared function **names**. It now also:

- downloads every deployed function's uploaded source (both generations: 63 today) and reduces it to a **git tree hash**, so each is matched to the **exact commit** it runs, or flagged if it matches none (deployed from an uncommitted tree);
- compares each function's `updateTime` and source hash with **`docs/deploy-ledger.json`**, the record of deploys a human accepted, and flags **any function that is live and not in a recorded deploy, was updated since, or runs different source**, and any ledger entry for a function that is gone.

Today's state, run against production: all 63 functions' sources match a repo commit, and the ledger (created today; 54 `baseline`, 9 `found-unrecorded`) reports clean. I also tampered with copies of the ledger and ran the real check: an older `updateTime` (the 10-01 redeploy), a missing entry (the 09-30 case), an extra entry (a deletion not recorded) and a changed hash were each flagged. **You record a deploy only after checking it**, with `--record-functions --only <names> --note "..."`; it will not record "everything that drifted". It also now times out a stalled request after 60 s instead of hanging (it hung for 9 minutes on a network stall today).

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
3. With no links, an empty file, a missing file, any error or no answer within 4 s, the page says in Hebrew and English that the app is not in the stores yet. With links it shows the matching buttons. No page edit is needed.

`legal:deploy` does not fail if the export cannot run (no Google credentials, no doc): it prints a loud warning, deletes any older `app-links.json` so a stale one never ships, and deploys with the "not in the stores yet" message (the build then writes `{"iosUrl":"","androidUrl":""}` itself, so the page always gets a 200). The export reads production through Application Default Credentials, like `seed-app-links.mjs`.

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

Run from `~/dev/bama-app`, in this order. First `git status -sb` should show a clean tree on `main`, not behind `origin/main`. **Rules need no deploy** (they match the repo; `docs/production-deploys.md` warns against casual rules deploys because of the `verified()` history), and **nothing here needs a native rebuild**.

### 1. Rebuild the site with the production origin

```
SITE_ORIGIN=https://bama-af0a0.web.app npm run legal:build
```

**Changes:** only the local, gitignored `legal-site/public/`. (That origin is already the default; setting it makes the intent explicit. It fills the absolute `og:image` / `og:url` URLs in `c.html`.) **Verify:**

```
ls legal-site/public                         # c.html and og-invite.png present
cat legal-site/public/app-links.json            # {"iosUrl":"","androidUrl":""} until store links are seeded
grep -c '{{' legal-site/public/c.html        # 0
grep -o 'og:image" content="[^"]*"' legal-site/public/c.html   # https://bama-af0a0.web.app/og-invite.png
node scripts/compare-legal-site-to-live.mjs  # first-ever deploy: 11 identical, 2 not live yet (c.html, og-invite.png). Redeploy of the anchor fix: see "Redeploy: anchor fix" below
```

**Stop if the last command prints any `DIFFERS`.** That script fetches each file from the live site and compares SHA-256 (read-only, public GETs); I ran it today and it reads exactly as above.

### 2. Deploy hosting

```
firebase deploy --only hosting --project bama-af0a0
```

**Changes:** publishes `legal-site/public` as the live site: adds `c.html` (served at `/c`, and for `/c/<anything>` through the rewrite), `og-invite.png`, and the header rules for `/c/**` and `/app-links.json`. The legal pages are unchanged (step 1 proves it). No functions, rules or data. **Verify:**

```
node scripts/compare-legal-site-to-live.mjs --all-live     # 14 identical, RESULT: OK (13 files + app-links.json)
curl -sI https://bama-af0a0.web.app/c/AbCdEfGhIjKlMnOpQrStUv | grep -iE '^HTTP|x-robots|referrer-policy'   # 200, noindex, no-referrer
curl -s  https://bama-af0a0.web.app/c/AbCdEfGhIjKlMnOpQrStUv | grep -c 'og:image'                          # 1
curl -sI https://bama-af0a0.web.app/og-invite.png | grep -iE '^HTTP|content-type|content-length'            # 200, image/png, 44546
curl -s https://bama-af0a0.web.app/app-links.json                                                          # 200 {"iosUrl":"","androidUrl":""} until store links are seeded
firebase hosting:channel:list --project bama-af0a0                                                          # the live row's release time is now
```

**Rollback:** the console's Hosting → Release history → roll back to the 2026-10-03 07:54 release. (The preview channel `invite-test` expires on its own at 2026-10-06 22:15; delete it earlier with `firebase hosting:channel:delete invite-test --project bama-af0a0`.)

### 3a. Delete `resolveCommunityInvite` (your decision)

```
firebase functions:delete resolveCommunityInvite --region europe-west1 --project bama-af0a0
```

**Changes:** removes the public, unauthenticated invite resolver (zero requests of any kind in 30 days; nothing calls it; the landing page does not). Reversible by redeploying it in phase 2. **Verify:** `gcloud functions describe resolveCommunityInvite --gen2 --region europe-west1 --project bama-af0a0` should say not found.

### 3b. Delete `callClaude` (your decision)

```
firebase functions:delete callClaude --region us-central1 --project bama-af0a0
```

**Changes:** removes the Anthropic-calling function (it is in `us-central1`, unlike the invite functions). Nothing calls it, and it had no successful call in the 30-day logs. The secret `CLAUDE_API_KEY` and its key versions are **not** touched. Redeploy when a screen actually calls it. **Verify:** `gcloud functions describe callClaude --gen2 --region us-central1 --project bama-af0a0` should say not found.

### 3c. Update the five invite functions

```
firebase deploy --only functions:createCommunityInvite,functions:getCommunityInvite,functions:revokeCommunityInvite,functions:onCommunityInviteJoinRequest,functions:onCommunityDeleted --project bama-af0a0
```

The predeploy step builds `functions/` first. With `--only` the CLI should not offer to delete anything; if it does, answer **N**. `resolveCommunityInvite` is not named, so it is untouched.

**Changes:** replaces the live 2026-09-26 code of these five with HEAD: **an owner push for every new join request, a 1-hour per-requester cooldown (server-only stamps, transactional, idempotent against duplicate delivery), stamps removed when a community is deleted**, plus everything else in `invites.ts`, `inviteCore.ts` and `rateLimit.ts` since those commits. Creates no new function. **Verify:**

```
for f in createCommunityInvite getCommunityInvite revokeCommunityInvite onCommunityInviteJoinRequest onCommunityDeleted resolveCommunityInvite; do
  printf "%-30s " $f; gcloud functions describe $f --gen2 --region europe-west1 --project bama-af0a0 --format='value(state,updateTime)'; done
# the first five: ACTIVE and updateTime = just now.  resolveCommunityInvite: still 2026-10-01T23:29, proving it was not touched.

read B O < <(gcloud functions describe onCommunityInviteJoinRequest --gen2 --region europe-west1 --project bama-af0a0 --format='value(buildConfig.source.storageSource.bucket,buildConfig.source.storageSource.object)')
gcloud storage cp "gs://$B/$O" /tmp/oc.zip && unzip -l /tmp/oc.zip | grep -E 'joinRequestAnnounce|joinRequestNotice'
# expect both files listed (today they are absent from the live source)

curl -s -X POST https://europe-west1-bama-af0a0.cloudfunctions.net/getCommunityInvite -H 'content-type: application/json' -d '{"data":{"tokenOrCode":"ZZZZZZ"}}'
# {"error":{"message":"Sign in required","status":"UNAUTHENTICATED"}}

gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR AND resource.labels.service_name=~"communityinvite|oncommunity"' --freshness=15m --project bama-af0a0 --limit 10
# no output = no errors since the deploy
```

**Rollback:** functions do not revert with a click. Redeploy the previous source: the live versions correspond to `invites.ts` at `11f783a3`; ask me and I will prepare the exact commands.

### 3d. Record the function changes in the ledger (after you have checked 3a to 3c)

```
node scripts/check-deploy-drift.mjs --project bama-af0a0
# before recording it SHOULD report: the five updated functions (new updateTime and source) and resolveCommunityInvite and callClaude (in the ledger, gone). Anything else is a surprise.

node scripts/check-deploy-drift.mjs --project bama-af0a0 --record-functions \
  --only createCommunityInvite,getCommunityInvite,revokeCommunityInvite,onCommunityInviteJoinRequest,onCommunityDeleted,resolveCommunityInvite,callClaude \
  --note "2026-10-06: five invite functions updated to $(git rev-parse --short HEAD) (owner push for every request, 1-hour cooldown, stamp cleanup); resolveCommunityInvite and callClaude deleted on purpose (phase 2 / no caller)."
# recorded: 5 updated, resolveCommunityInvite and callClaude removed

node scripts/check-deploy-drift.mjs --project bama-af0a0   # the ledger line is now green
```

Then commit `docs/deploy-ledger.json`.

**The allowlist entries for `resolveCommunityInvite` and `callClaude` stay; they are not cleared.** `scripts/deploy-drift-allowlist.json` lists functions that are exported in the code but **intentionally not deployed**. After 3a and 3b that is exactly what these two are, so the entries become correct again (today they read as stale only because the functions are still live). Removing them would make the check report two exported functions as *missing*, which is drift. What I do after you confirm the deletions: refresh each entry's reason and reset its date to 2026-10-06 (an entry expires after 60 days, so each must then be re-affirmed or deployed). The five invite entries, which stay deployed, are already gone. After that the drift check should be fully green.

### 4. Seed `config/appLinks` in production

Needs your Google credentials as Application Default Credentials (`gcloud auth application-default login` if it says it cannot find any; it worked for me read-only today).

```
node scripts/seed-app-links.mjs --project bama-af0a0 --dry-run   # target PRODUCTION; "no existing doc"; the doc below
node scripts/seed-app-links.mjs --project bama-af0a0
node scripts/seed-app-links.mjs --project bama-af0a0 --verify    # VERIFY OK
```

**Changes:** creates one document, `config/appLinks` = `{ baseUrl: 'https://bama-af0a0.web.app', iosUrl: '', androidUrl: '' }`. It refuses to overwrite an existing one. From then on `createCommunityInvite` succeeds and links read `https://bama-af0a0.web.app/c/<token>`. **Verify end to end:** run the app against production (`npx expo start`, **without** `EXPO_PUBLIC_USE_EMULATORS`), as a community owner in professional mode tap "Share community" and confirm a link appears; open it in a browser (landing page) and paste a fresh one into WhatsApp (card); then, as a second non-owner account, open it and request to join: the owner gets the push once, and cancelling and re-asking within the hour stays silent.

**Why this order:** each step stands alone. Between 3 and 4 invites cannot be created (the share row shows "Invite links aren't available right now"), nothing breaks. Doing 3 before 4 means the first invites ever created already run the new code.

### Decisions that are yours (not part of the four steps)

- **`resolveCommunityInvite`**: decided, delete (step 3a).
- **`callClaude`**: decided, delete (step 3b). Separately, and still open: disabling Secret Manager versions 1 and 2 of `CLAUDE_API_KEY`, and checking the Anthropic console's own spending limit.
- **The Monitoring threshold**: 5 per second, decided; you set it in the console.
- After 3a and 3b, tell me and I refresh both allowlist entries (kept, not removed; see 3d).

## Flaky test, logged: a suite that intermittently fails to LOAD

**`src/core/stores/__tests__/authStore.test.ts`** (5 tests: initial state, `setUser`, `setActiveMode`, `setLoading`, `clear`) showed as a failed suite **once**, on 2026-10-06, in a full `npx jest` run: `Test Suites: 1 failed, 361 passed, 362 total` and `Tests: 3170 passed, 3170 total`. That is **5 tests fewer than the 3175 of every other run**: the suite **failed to load, so none of its tests ran**; it did not fail an assertion. It passed run alone and in the next full run (362 suites, 3175 tests).

**Why this is worse than a flaky assertion.** A failed assertion is loud. A suite that fails to load looks like "1 failed" in a long run, is easily rerun and forgotten, and until then **that run had less coverage and nothing said so**; the only trace is a lower test count.

**What I do not know:** the error text. My command filtered the output down to the summary lines and the rest was not kept. **A correction to what I said then:** I blamed "load, alongside the node tests". Those commands were sequential (`node --test`, then `tsc`, then `jest`), so I had no basis; I withdraw it. I know of nothing else that was running. A shared-module or worker problem is possible (the auth store is imported by many suites); that is a guess, not a finding.

**So the capture is now automatic: `npm run test:checked`** (`scripts/jest-checked.mjs`) runs Jest, always writes its full JSON to `.jest-last-run.json`, reports suites that **failed to load** separately from failed assertions **with the real error text**, warns when **fewer tests ran than last time**, and on any bad run keeps a timestamped copy in `.jest-failures/` (both gitignored); it exits non-zero on a load failure even if Jest itself said success. I checked it against a genuine load failure (a test importing a module that does not exist): it named the file, showed the actual error, kept the JSON and exited 1. I will use it for my full runs from now on. When `authStore.test.ts` fails to load again, `.jest-failures/` will hold the reason. **Not chased.**

## Commits

`802d73bf` → `ee4b1620` → `f163737a` → `3fa28141` → `2dd36674` → `6d92e3de` → `9ffd958c` → `d66491f4` → `7b2c85e9` (listing button) → `96b1241d` (push for every request) → `b1b98748` (store links) → `6f092666` (emulator mode, fixture, LAN config) → `f342bcb7` → `41dc5fe2` → `30608720` (fallback line) → `a233cfa6` (link card) → `8355805b` (push cooldown) → `623e2301` (empty states) → `4512731c` (fixture password) → this doc.

## Redeploy: anchor fix (built, NOT deployed)

What changed in `legal-site/static/c.html` and the build:

- **Hang case:** if `/app-links.json` never answers, the stores area shows "not in the stores yet" after 4 s (a late real answer still upgrades it). Nothing in that code can touch the button.
- **No 404 on the normal path:** `scripts/build-legal-site.mjs` always emits `app-links.json` (`{"iosUrl":"","androidUrl":""}` when nothing was exported; an exported file is never overwritten). The built site is now **14 files**, so the post-deploy check reads **14 identical**.
- **Debug line:** the built link is printed as small text under the button (`bama://c/<token>`, tap-and-hold to copy). If a tap ever fails, a screenshot shows exactly what the page built.
- **Tests:** unit tests per failure mode (404, network error, HTML 200, JSON junk, never answers) assert the href AFTER the failure settles; a real-browser test (Chromium and WebKit via Playwright, skipped if not installed) does the same against a server with `/app-links.json` absent, default and hanging. Four mutations (no timeout, href set after fetch, no failure handler, no debug line) were each caught.

Deploy and verify (you run it):

```
SITE_ORIGIN=https://bama-af0a0.web.app npm run legal:build
node scripts/compare-legal-site-to-live.mjs   # expected: 12 identical, 1 differ (c.html: the new page), 1 not live yet (app-links.json); RESULT: FAIL is expected this once
firebase deploy --only hosting --project bama-af0a0
node scripts/compare-legal-site-to-live.mjs --all-live   # 14 identical, RESULT: OK
```

**What this does not prove:** Playwright's WebKit is not Mobile Safari. The anchor is a plain `<a id="open" class="open" href="bama://c/<token>">` with no `target`, `rel`, `download`, `ping`, handler or `preventDefault`; its only child is an inline `<small>`; a hit-test at its centre lands on the anchor, in an iPhone-profile WebKit and a Pixel-profile Chromium. In both, tapping the label or the `<small>` does the same thing. Nothing found distinguishes a real Safari tap from Playwright's, but headless WebKit swallows an unhandled custom scheme silently, so it cannot reproduce Safari's "address is invalid" dialog either way. Only a phone can.
