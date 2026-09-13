# Community invites: current spec

One document of what's true now. It replaces the earlier layered revisions.
Last updated 2026-09-13. The working copy of the plan; update it in place when a decision changes.

## Context
Users invite people into a community with a share link (`<baseUrl>/c/<token>`) or a 6-character code. An invite only ever leads into the **existing join-request flow**: never auto-join, never a second request type or admin surface. URLs are built from config because the real domain isn't registered yet. The web side (Hosting, association files, the landing page) is a separate, **parked** task, waiting for a real domain.

## Status

| Piece | State |
|---|---|
| Re-request rules fix | `c9e13e4`, deployed and verified in production |
| Step 0: deep-link intent layer | `9131e12`, pushed (client code, no deploy) |
| Step 1: invite index | `335c0ad`, deployed, READY |
| Step 1: invite rules | `5fe615c`, deployed and verified in production |
| Step 2: functions | built and tested on the emulator, **not deployed** (see "Step 2 deploy") |
| Steps 3–7 | not started |

Live versions are recorded in `docs/production-deploys.md`.

## Facts the design rests on
- **Communities:** `chats/{id}` with `type: 'community'`, a `members: string[]`, and a single `ownerId`. No per-community admins; `roles` is vestigial (flagged separately, untouched). App admins: token claim `role == 'admin'`.
- **Join requests:** `chats/{id}/joinRequests/{uid}`, holding `{ userId, displayName, requestedAt: serverTimestamp, status }`. The owner sees them only in the ChatRoomScreen Manage modal and approves client-side.
- **Communities are pro-only in the UI.** New pros are locked to the profile screen until it's complete. `src/app/c/[token].tsx` sits outside the mode groups, so that lock doesn't wrap it.
- **Functions:** existing callables stay in us-central1 (don't move them). New invite functions go in **europe-west1**, called through a second client instance, `getFunctions(app, 'europe-west1')`.
- **`config/{doc}`:** readable by any signed-in user, not client-writable. `config/appLinks { baseUrl, iosUrl, androidUrl }` is written only by an Admin script.

## Decisions (current, final)
- **Who can create an invite:** the owner or an app admin. Regular members **only if `community.allowMemberInvites === true`**. No toggle exists, so in practice it's the owner and app admins.
  - The **share button uses the identical predicate** as the function, from one shared helper, so the button is never visible when the server would refuse.
- **Who can revoke:** the owner or an app admin can revoke any invite for the community. Anyone else can revoke only invites they created. Enforced in the function.
- **Invite reuse:** tapping share again returns the caller's existing non-revoked invite for that community, not a new token.
- **Token and code:**
  - token: 22 characters from `randomBytes(16).toString('base64url')`;
  - code: 6 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` via `crypto.randomInt`, unique through a `communityInviteCodes/{code}` lookup doc created in the same transaction.
- **Data:**
  - `communityInvites/{token}`: `{ shortCode, communityId, createdBy, createdAt, revoked: false, expiresAt: null, useCount: 0 }`;
  - `communityInviteCodes/{code}`: `{ token }`.
  - Both are client-denied (live rules).
- **A join request from an invite:** the same doc, plus `via: 'invite'` and `inviteToken`. The rules require a live invite for that community (live).
- **Public resolver `resolveCommunityInvite`:**
  - **Built and tested in step 2, but NOT deployed until the web task.**
  - A hit returns exactly `{ exists: true, revoked: false, communityName, description, avatarUrl }`.
  - Every miss (unknown, revoked, deleted community, malformed input) returns the byte-identical `{ exists: false }`.
  - Rate-limited returns `429 { rateLimited: true }` with `Retry-After`.
  - `maxInstances: 10`, CORS, GET only, `Cache-Control: no-store`.
- **Authenticated `getCommunityInvite(tokenOrCode)`** is the app's only way to look up an invite. It's used by the `/c/[token]` route **and by invite-code entry**.
  - Revoked: `{ exists: true, revoked: true }` and nothing else.
  - Live: `{ exists: true, revoked: false, token, communityId, communityName, description, avatarUrl, membership: 'member'|'pending'|'none' }`.
  - Unknown: `{ exists: false }`.
- **No public-resolver client method ships.** No `resolvePublic`, and no code that calls the public URL, until the web task deploys that endpoint.
- **Rate limiting** (`functions/src/communities/rateLimit.ts`):
  - **Authoritative:** a Firestore fixed window. Doc `rateLimits/{sha256(key)}_{floor(now/60s)}` holding `{ count, expireAt }`. A transaction increments only while `count < 30`. Over the limit is a read with no write. If the transaction fails, it **fails closed** with 429.
  - **In front:** an in-memory first pass per instance (sliding 60s, 30 per key, capped map), commented as *not the limit*.
  - **Rate keys:**
    - `getCommunityInvite` → caller **uid**;
    - `resolveCommunityInvite` → client IP (full IPv4, or IPv6 /64) taken from the rightmost `X-Forwarded-For` entry.
  - **Worst case per key:** 30 per minute sustained, up to 60 in about two seconds across a window boundary. At most 300 attempts per minute reach Firestore from one key (30 × 10 instances), and denied attempts cost one read each.
- **Intent persistence** (step 0, done):
  - the resume href and the after-profile action expire after 7 days;
  - hrefs are allowlist-checked when read back (`/c/<token|code>` only);
  - they're used once, in `useSwitchMode`, and cleared on logout.
- **`/c/[token]` gating:**
  - the preview renders in any mode;
  - requesting to join needs professional mode **and** a complete pro profile;
  - client mode → an explicit confirm before switching to pro;
  - incomplete pro → the profile screen, with the invite kept; on save, the request is sent automatically and they land on the pending preview.
- **Host:** `config/appLinks.baseUrl = 'https://bama-af0a0.web.app'` for development. Switching to the real domain is a single config edit.

## Unverified until the web task (don't read local green as correct)
- **`resolveCommunityInvite`'s IP rate key is UNVERIFIED.** On Cloud Run, which `X-Forwarded-For` entry is the real client, and whether a client-supplied header can spoof the key, can only be checked on the deployed endpoint. It isn't deploying in step 2, so this stays open until the web task.
- **`getCommunityInvite` is unaffected,** because it keys on the authenticated uid, not the IP.
- **Also post-deploy-only for the resolver:**
  - real CORS preflight;
  - cross-instance limiting;
  - behaviour at `maxInstances`;
  - cold start latency;
  - `allUsers` invoker binding;
  - transaction contention under load;
  - `Retry-After` / `no-store` surviving the front end.

## Step 2: build and test locally (done)
**Files** (`functions/src/communities/`):
- **`inviteCore.ts`** (pure):
  - `generateToken`, `generateShortCode`;
  - `canCreateInvite`, `canRevokeInvite`;
  - `publicResolveBody` + `PUBLIC_MISS`, `authedInviteBody`;
  - `rateKeyFromRequest`: IPv6 /64, rightmost `X-Forwarded-For`;
  - `buildInviteUrl`: https only, trailing slash trimmed.
  - The same `canCreateInvite` predicate is also exported for the client in step 3 (copied into `src/features/communities/invites/permissions.ts`, with a parity test comparing both over the same matrix).
- **`rateLimit.ts`:** the Firestore window plus the in-memory first pass, injectable for tests.
- **`invites.ts`**, all `region: 'europe-west1'`:
  - `createCommunityInvite`:
    - auth, then the chat exists with `type: 'community'`, then `canCreateInvite`;
    - reuses the caller's invite (READY composite index);
    - otherwise a transaction writes the invite and its code doc, retrying up to 5 times on a code collision;
    - URL from `config/appLinks.baseUrl`, which returns `failed-precondition` if missing or not https.
  - `getCommunityInvite`: auth, per-uid limit, token or code, membership from `members` and `joinRequests/{uid}`.
  - `revokeCommunityInvite`: `canRevokeInvite`, idempotent.
  - `resolveCommunityInvite` (`onRequest`): built and exported, **excluded from step 2's deploy command**.
  - `onCommunityInviteJoinRequest` (`onDocumentWritten` `chats/{chatId}/joinRequests/{uid}`): `useCount += 1` when a doc becomes pending with an `inviteToken`, once per pending request.
  - `onCommunityDeleted` (`onDocumentDeleted` `chats/{chatId}`, `type == 'community'`): deletes that community's `communityInvites` **and** their `communityInviteCodes` docs, batched.
- **`functions/src/index.ts`:** `export * from './communities/invites'`. Admin statics come from `lifecycle/helpers` (`FieldValue`), not `admin.firestore.X`.

**Tests:**
- **Unit** (`functions/src/__tests__/communityInvites.test.ts`):
  - token and code shape, and the randomness source;
  - the full create and revoke matrices;
  - the public hit has exactly those keys, and all misses are deep-equal;
  - the revoked authenticated body has no name, id or token;
  - rate key: IPv6 /64, spoofed left-side `X-Forwarded-For` ignored (a logic test only; the real-network behaviour stays unverified);
  - URL building;
  - the in-memory limiter.
- **Emulator** (`scripts/probe-invite-functions.mjs`, with functions + firestore + auth emulators, calling the real functions):
  - create and reuse;
  - non-member denied, and a member without `allowMemberInvites === true` denied;
  - missing `baseUrl` → `failed-precondition`;
  - revoke permissions;
  - `getCommunityInvite` returning revoked, member, pending and none;
  - resolve hit and miss bodies byte-identical, and the 31st request is 429 with `Retry-After`, while a different key is not limited;
  - `useCount` incremented once;
  - the delete trigger removing invites and code docs;
  - `rateLimits` docs written with `expireAt`.
- **Mutation checks:**
  - an extra key in the public body;
  - revoked leaking `communityName`;
  - a member revoking someone else's invite;
  - the Firestore window bypassed;
  - `allowMemberInvites` treated as `!== false`.
- **Gates:** `npm --prefix functions run build`, `npx tsc --noEmit`, the full `npx jest`, and the drift check, where only the new exports should show as "not deployed".

**Also in step 2 (docs only):** file two items in `docs/pre-launch-backlog.md`:
1. **Make join-request approval atomic.** It's two non-atomic owner writes; a `writeBatch` under the same rules removes the silent "approved but not a member" failure.
2. **Fix the broken admin "delete community"** (a client `deleteDoc` that the rules deny, and an `Alert` that does nothing on web). Add the missing cascade for `joinRequests`, `messages` and `channels`.

Then commit, push and report. **No deploy.**

## Step 2 deploy (separate, after approval)
1. **Budget alert and Monitoring policy:** you're configuring these now.
2. **TTL policy on `rateLimits.expireAt`. It IS needed for step 2,** because `getCommunityInvite` writes rate-limit docs.
   - **When:** immediately **before** the functions deploy. A TTL policy can be created on a collection group with no docs yet.
   - **How:** `gcloud firestore fields ttls update expireAt --collection-group=rateLimits --enable-ttl --project bama-af0a0`.
   - **Wait until it shows ACTIVE** (`gcloud firestore fields ttls list`) before deploying, so the first docs written are covered.
3. **Seed `config/appLinks`:** `scripts/seed-app-links.mjs --dry-run`, then a real run once you confirm.
4. **Deploy exactly:** `firebase deploy --only functions:createCommunityInvite,functions:getCommunityInvite,functions:revokeCommunityInvite,functions:onCommunityInviteJoinRequest,functions:onCommunityDeleted`. Named, never `--only functions`, and **not** `resolveCommunityInvite`.
5. **Verify in production** with throwaway fixtures, cleaned up (as done for rules):
   - create/reuse/revoke;
   - `getCommunityInvite` states;
   - the `useCount` trigger;
   - the delete-cleanup trigger;
   - the rate-limit doc appearing, and TTL applying.
6. **Record** in `docs/production-deploys.md`.

## Steps 3–7 (after step 2 deploy)
- **3. Client plumbing:**
  - `functionsEU` instance in `config.ts`, and a region option on `callFunction`;
  - `inviteService` with `createInvite`, `revokeInvite`, `getInvite` only (**no public resolver method**);
  - `permissions.ts` (`canCreateInvite` mirror + parity test);
  - `chatService.requestToJoinCommunity(communityId, uid, displayName, inviteToken?)`, which Discover and the preview both use.
- **4. `/c/[token]` route + `InvitePreviewScreen`.** States:
  - signed out → save the resume href → `/(auth)`;
  - invalid/revoked → empty state;
  - member → into the community (confirm first if not in pro mode);
  - pending → "request sent";
  - none → preview + "בקשה להצטרף", with the gating above.
  - The profile screen sends the saved after-profile join request once a save completes the profile.
- **5. Share button** on community details:
  - visible exactly when `canCreateInvite` (the shared predicate) is true;
  - generic `Share2` icon, label "שיתוף הקהילה";
  - message: name, URL, then "קוד הצטרפות: XXXXXX";
  - native `Share.share`; web `navigator.share`, falling back to clipboard + `showToast` (never `Alert`).
- **6. Invite-code entry:**
  - "יש לך קוד הזמנה?" under the Discover heading, opening a modal;
  - input filtered to the code alphabet;
  - **`getCommunityInvite(code)`**: exists and not revoked → `router.push('/c/' + code)`; revoked → "this invite was revoked"; unknown → "code not found"; rate-limited → "נסה שוב בעוד רגע".
- **7. Config seeding:** covered in the step 2 deploy.
- **i18n:** `community_invite.*` keys in `he.json` and `en.json`, following each screen's existing convention.
- **Every step:** tests with mutation checks, `tsc` + the full jest before committing; rules and indexes changes only with a live-vs-local diff before deploying.

## Needs the real domain later
- `config/appLinks.baseUrl`;
- `src/core/constants/legal.ts` (`TERMS_URL` and `PRIVACY_URL` are `example.com` placeholders);
- `AppHeader.tsx` Information/Privacy/Terms rows (`Alert 'Coming soon'`);
- a support URL or email (none exists);
- `app.json` `associatedDomains` and Android intent filters (web task);
- Hosting custom domain, AASA, `assetlinks.json` (web task);
- App Store Connect and Play Console privacy, support and marketing URLs.
