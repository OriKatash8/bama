# Community invite links: Step 1 investigation report and proposed change list

Repo investigated: `~/dev/bama-app`, read-only. Nothing was edited and nothing was deployed.

## Context

You want shareable invite links for BAMA communities. An owner posts a link in WhatsApp. The recipient lands on a join screen in the app, or on a web landing page if they don't have the app, and sends a join request that the owner approves.

**Big finding: about half of this is already built.** `docs/community-invites-spec.md` (267 lines, dated 2026-09-13) and `docs/status/2026-09-13-community-invites.md` describe the system. Its backend is written:
- `functions/src/communities/invites.ts` and `inviteCore.ts`.
- The `firestore.rules` additions.
- The `src/core/deepLinks/allowlist.ts` and `src/core/stores/pendingIntentStore.ts` plumbing.

The spec lists the client screens (steps 3-7) as not started. It lists the web side as parked until a real domain exists. The proposal below therefore builds the spec's remaining steps. It does not start a new design.

---

## Findings

### 1. `src/app/(client)/chat/community-details.tsx` (582 lines)

- **There is no "Manage" row.** The owner control is a "Dashboard" pill button inside the identity card, at lines 263-283. The label key is `community_admin.open_dashboard`, and it routes to `community-admin?chatId=`.
- **Owner gate:** `const isOwner = currentUserId === community.ownerId;` (line 174), with `currentUserId = auth.currentUser?.uid ?? ''` (line 78). `CommunityAdminScreen` re-checks ownership at line 48 and redirects non-owners at line 91.
- **`CommunityManageModal` is dead.** It is no longer mounted anywhere. Only a comment in `src/app/admin/reports.tsx` mentions it. Its tests still exist.
- **Chat doc loading:** `onSnapshot(doc(db,'chats',chatId))` at lines 89-105 sets `community: Chat | null`. The `chatId` param comes from `useLocalSearchParams`.
- **In scope on the screen:**
  - `members`, `isOwner`, `chatGroup`, `rtl`, `lang`, `rowDir`, `align`, `colors`.
  - A local `t = makeT(rtl ? he : en)`, not `useTranslation`.
  - There is no `useUiStore` import yet.
- **Early returns** for loading and not-found sit at lines 153-171. Any new hook must go above them.
- **JSX order:**
  1. Header.
  2. Identity card.
  3. Search row.
  4. Bio card.
  5. Members card.
  6. `ChatMediaSection`.
  7. Notifications card.
  8. Leave pill, or an owner note.
- **Pattern to reuse for an "Invite" row:** the search row at lines 288-300.
  - A `TouchableOpacity` styled `[styles.settingCard, styles.searchRow, {flexDirection: rowDir}]`.
  - A lucide icon of size 18 in `colors.primary` (`Share2` per the spec), plus an `AppText` using `styles.settingLabel`.

### 2. Community and chat type

`src/features/chat/types.ts`:
```ts
export type ChatType = 'dm' | 'group' | 'community' | 'purchase';
export interface Chat {
  id: string; type: ChatType; members: string[];
  communityId?: string | null; ownerId?: string; projectId?: string;
  name?: string; description?: string;
  photoURL?: string;                      // photo field name
  roles?: Record<string, 'admin' | 'member'>;
  lastMessage?: LastMessage | null; createdAt?: Timestamp;
  unreadCount?: ...; channelUnread?: ...; category?: string;
  // plus purchase/archive/readOnly fields
}
```
- **Member count is derived** from `members.length`. There is no `memberCount` field.
- **No public/private flag.** Every `type == 'community'` chat shows in Discover.
- **`allowMemberInvites`** is read by the server-side `canCreateInvite` but is not in the client `Chat` type and nothing sets it. Today only the owner or an app admin can invite.
- **Creation:** `createCommunityChat` in `src/features/chat/services/chatService.ts:197-222`. The rules let only admins create communities from the client.

### 3. `chats/{chatId}/joinRequests/{uid}`

- **Fields:** `userId`, `displayName`, `requestedAt` (serverTimestamp), `status`, and `decidedAt` on a decision.
  - `status` is one of `'pending' | 'approved' | 'rejected'`.
  - The rules also allow optional `via: 'invite'` and `inviteToken` (22 characters, `[A-Za-z0-9_-]`). They are both-or-neither, and the token must name a non-revoked invite for this chat. **The client does not write them yet.**
- **Writers and readers:**

| Location | Role |
|---|---|
| `useCommunityDiscovery.ts:57` | read own request |
| `useCommunityDiscovery.ts:71` | `requestToJoin` create |
| `useCommunityDiscovery.ts:85` | cancel (delete while pending) |
| `communityMembership.ts` | `approveJoinRequest` (transaction), `approveAllJoinRequests` (batches of 150), `rejectJoinRequest` |
| `communityAdmin/hooks.ts:64` | `useJoinRequests` pending listener |
| `CommunityAdminScreen.tsx:107,125,145` | approve, reject and approve-all actions |
| `CommunityManageModal.tsx:85` | dead code |
| `functions/.../invites.ts:158` | `getCommunityInvite` reports `membership: 'pending'` |
| `functions/.../invites.ts:239` | `onCommunityInviteJoinRequest` trigger bumps `useCount` |
| `firestore.rules:828-909` | rules |
| Tests | `communityMembership.test.ts`, `CommunityManageModal.test.tsx` |

- **Approval is client-side.**
  - A transaction sets `status: 'approved'` and `decidedAt`, and does `arrayUnion` on `members`.
  - There is no Cloud Function for approval.
  - Nothing notifies the owner of a new request.

### 4. Deep linking state

- **Scheme:** `app.json` has `"scheme": "bama"`.
- **Missing:** no `ios.associatedDomains`, no Android `intentFilters`, and no `com.apple.developer.associated-domains` in `ios/BAMA/BAMA.entitlements`.
- **Native projects:** `ios/` is checked in, so associated domains need a prebuild or a manual entitlement edit, plus a native rebuild.
- **expo-router plugin:** it is configured as a bare string with no `origin`.
- **Versions:** expo ~57.0.26, expo-router ~57.0.24, react-native 0.86.3, expo-linking ~57.0.11 (a dependency).
- **Linking in `src/`:**
  - `expo-linking`, `useURL` and `getInitialURL` are unused.
  - `Linking` from React Native is used only for outbound `openURL` and `openSettings`.
  - No screen parses an incoming URL itself. expo-router resolves `bama://path` on its own.
- **Notification deep links:** `src/core/notifications/useNotificationRouting.ts` is the only custom routing. It queues taps until the user is signed in and not gated.
- **Existing intent layer with no writer:** commit `9131e12f` added three pieces.
  - `pendingIntentStore.ts`: persisted, with `saveResume`, `takeResume`, `saveAfterProfile`, `peekAfterProfile` and `clearAll`, and a 7-day TTL.
  - `allowlist.ts`: allows only `^/c/<22-char token | 6-char code>$`, with no query string.
  - `useSwitchMode.ts:~20-27`: calls `takeResume()` and does `router.replace(resume)`, which wins over the mode home.
- **No caller of `saveResume` exists.** There is no `src/app/c/` route.

### 5. expo-router layout and the auth gate

- **Layout chain:**
  - `src/app/_layout.tsx` is a `<Slot/>` shell, not a Stack.
  - `(client)/_layout.tsx` is the gate and ends in a `Stack`.
  - `(client)/chat/_layout.tsx` is `<Stack screenOptions={{headerShown:false}}/>`.
- **Routes under `(client)/chat`:** `[chatId]`, `community-admin`, `community-details`, `community-search`, `project-details`.
- **Params** are read with `useLocalSearchParams<{...}>()`.
  - The three community screens take a `chatId` query param.
  - `[chatId]` is a path param.
- **`(client)/chat` and `(professional)/chat` clash.** Both exist, and groups are stripped from URLs, so a bare `/chat/...` link is ambiguous. The notification code uses explicit group hrefs for that reason.
- **A signed-out user cannot see anything under `(client)/chat`.**
  1. The URL resolves straight to the group, bypassing `src/app/index.tsx`.
  2. `useOnboardingGate` returns `/(auth)` and the layout renders `<Redirect>`.
  3. **The original URL is dropped.**
  4. After login the flow is mode-select, then `switchMode`, then the mode home. `takeResume()` is null because nothing saved a resume.
- **Other rungs drop the URL too:**
  - Order: consent, then verify-email, then profile setup, then phone.
  - Also the client `onboarding` redirect and the pro `profile` lock.
- **Cold-launch mode-select** (commit `ef6f2dc4`, the `launchRouted` flag) applies only to the `/` URL. A deep link skips it.
- **Mode mismatch:** `useAdoptGroupMode` does not switch the active mode. A link opened while the saved mode is the other one renders with the wrong `activeMode`, so internal links point at the wrong group.
- **Web build:** `app.json` has `web.output: "single"` (SPA). There is no export script and no `dist/`.

### 6. Firebase Hosting

`firebase.json` has a `hosting` block:
```json
"hosting": { "public": "legal-site/public", "cleanUrls": true, "trailingSlash": false,
  "headers": [{ "regex": "^/(?:[^.]*|.*[.]html)$", "headers": [{"key":"Cache-Control","value":"max-age=300"}] }] }
```
- **Project:** `.firebaserc` default is `bama-af0a0`, with no aliases and no `site` or `target`.
- **No rewrites, no redirects, no `.well-known`, no AASA, no `assetlinks.json`.**
- **What is deployed:** only the static legal pages, which `scripts/build-legal-site.mjs` builds into gitignored `legal-site/public`. The local `.firebase/hosting.*.cache` lists just those files.
  - Pages: `index`, `terms`, `privacy`, `refunds`, `en/*`, plus icons.
  - Scripts: `npm run legal:build` and `npm run legal:deploy`.
  - I did not verify production directly.
- **Invite base URL:** the dev config is `https://bama-af0a0.web.app`. `config/appLinks` is seeded by `scripts/seed-app-links.mjs`. I did not check whether it is seeded in production.

### 7. `firestore.rules`

I'm summarizing these rules here. The verbatim text is at `firestore.rules:605-909` and was captured during the investigation.

**`match /chats/{chatId}`:**
- **Read** (lines 606-612): signed-in only, for members, any `type == 'community'` doc, or an admin reading a group. Signed-out reads are impossible.
- **Create:** verified, and admins or the `clientChatCreateOk` types only.
- **Update:** an allowlist over touched keys. A community member can change `members` only to remove themselves. The owner can add or kick members.
- **Delete:** `false`.

**`match /joinRequests/{requestId}`:**
- **Create:**
  - The requester's own uid.
  - Keys limited to `['userId','displayName','requestedAt','status','via','inviteToken']`.
  - `requestedAt == request.time` and `status == 'pending'`.
  - `hasValidInviteOrigin`, which requires `via=='invite'`, a 22-character token, and an existing non-revoked `communityInvites/{token}` for this chat.
  - `communityOnCallerSide` (demo isolation).
- **Read:** the requester, the chat owner, or an admin.
- **Update:**
  - Owner decision: `status` and `decidedAt` only, to approved or rejected.
  - Admin.
  - Requester re-ask after the request was settled, while not a member.
- **Delete:** the requester, only while pending.

**Invite collections:** `communityInvites/{token}` and `communityInviteCodes/{code}` are `allow read, write: if false`. `config/{docId}` is readable by any signed-in user.

### 8. `functions/src`

- **Runtime:** Node 22, `firebase-functions` 5.1.1, `firebase-admin` 12. There is no `setGlobalOptions` in non-test code (that grep was not fully verified).
- **Mixed APIs:** old notification triggers are v1, newer files are v2.
- **Regions:** older functions use the default `us-central1`. The invite functions are pinned to `europe-west1`.
- **Community functions** (`functions/src/communities/`):
  - `createCommunityInvite`: callable, returns `{token, shortCode, url}`, idempotent per community and creator.
    - Needs a verified email and `config/appLinks.baseUrl`.
    - Allowed for the owner or an admin via `canCreateInvite`.
  - `getCommunityInvite({tokenOrCode})`: callable and rate-limited. It returns community info plus `membership: 'none' | 'member' | 'pending'`, and throws `failed-precondition: demo-isolation` across the demo boundary.
  - `revokeCommunityInvite({token})`.
  - `resolveCommunityInvite`: a public GET endpoint, exported but **not** to be deployed until the web landing task.
  - `onCommunityInviteJoinRequest`: `onDocumentWritten` on `chats/{chatId}/joinRequests/{uid}`, which bumps `useCount`. It sends no notification.
  - `onCommunityDeleted`: invite cleanup.
  - `adminCommunityAction` and `adminDeleteCommunity`: both in the default region.
- **Notification triggers:** `onNewCommunityMessage` and `onNewChatMessage` (v1). Nothing fires on a join request.
- **Deploy status:** per `docs/production-deploys.md:63-67`, the 5 invite functions were **not yet deployed** as of 2026-09-25, held for a budget-alert confirmation. The rules were reported deployed. I did not check production.
- **Indexes:** the `communityInvites (communityId, createdBy, revoked)` index is recorded as deployed.

### 9. Clipboard, share and toast

- **`expo-clipboard`** is not installed and nothing uses it. Adding it is a native module and needs a rebuild.
- **`Share.share`** is not used anywhere in `src/`.
- **Toast exists:**
  - `useUiStore().showToast(message, 'success' | 'error' | 'info')` from `src/core/stores/uiStore.ts`.
  - `ToastContainer` is mounted in `src/app/_layout.tsx:106`.
  - Example call sites: `ListingDetailModal.tsx:149-153` and `profile/index.tsx:150`.
- **Client Functions instance:** `src/core/firebase/config.ts:60` has `getFunctions(app)` only, with the default region. `callFunction` in `src/core/firebase/functions.ts` takes only a name. Calling `europe-west1` functions needs a region-aware instance.
- **i18n:** there are no `community_invite.*` keys yet. The spec says to add them to `he.json` and `en.json`.

---

## Proposed change list (builds spec steps 3-7)

### Client (`~/dev/bama-app/src`)
1. **`src/core/firebase/config.ts` and `functions.ts`:** export a `europe-west1` Functions instance, and let `callFunction` take an optional region.
2. **`src/features/communities/inviteService.ts` (new):** wrappers for `createCommunityInvite`, `getCommunityInvite` and `revokeCommunityInvite`. Add `requestToJoinViaInvite(chatId, token)` that writes the existing request payload plus `via:'invite'` and `inviteToken`, matching the `isOwnPendingRequest` key set exactly.
3. **`src/app/c/[token].tsx` (new, outside the groups) plus `InvitePreviewScreen`:**
   - Signed out: `saveResume('/c/<token>')`, then redirect to `/(auth)`. This is the first caller of `saveResume`.
   - Signed in: call `getCommunityInvite`, show the community name, photo, description and member count, then show a state-aware CTA (join, request pending, already a member, invite not found or revoked, demo-isolation blocked).
   - On join, call `requestToJoinViaInvite`, then show a pending state. If already a member, `router.replace` to the chat with an explicit group href.
   - This route sits outside the gated layouts, so it must handle the auth and onboarding rungs itself, or rely on the saved resume.
4. **`community-details.tsx`:** add an "Invite link" row using the search-row pattern.
   - It is visible when the owner (or an allowed member) can invite.
   - Press: create or fetch the invite, then share.
   - Use `showToast` for feedback.
   - Put the new hooks above the early returns at lines 153-171.
   - Also add `allowMemberInvites?: boolean` to the `Chat` type if member-invite visibility is wanted.
5. **Sharing:** `Share.share({message, url})` on native, and on web `navigator.share` with a `navigator.clipboard` fallback plus a toast. See open question 2 about adding `expo-clipboard`.
6. **`src/core/deepLinks/allowlist.ts`:** no change expected, since `/c/<token>` is already allowed.
7. **i18n:** add `community_invite.*` keys to `he.json` and `en.json`.
8. **Tests:** invite service payload shape against the rules' key set, the preview screen states, the signed-out `saveResume` and `takeResume` round trip, and the owner gate on the new row.
9. **Cleanup (separate, optional):** remove the dead `CommunityManageModal` and its test.

### Server and rules
10. **No new rules expected.** The `joinRequests` and `communityInvites` rules already exist. I'd verify them against the emulator, noting that it can't validate composite indexes.
11. **Deploy** the 5 invite functions by name, and seed `config/appLinks` in production. Both are outward-facing, so I'd confirm first and not do them unprompted.
12. **Optional:** a trigger to push-notify the owner of a new join request. Today they only see it in the dashboard.

### Web and app links (parked in the spec, needed for the WhatsApp use case)
13. **Landing page:** a `/c/<token>` page in `legal-site/` (or a new Hosting public dir).
    - It shows the community preview through the deployed `resolveCommunityInvite`.
    - It has "Open in app" and store buttons.
    - It needs a Hosting rewrite for `/c/**` and a deploy of `resolveCommunityInvite`.
14. **Universal links and App Links:**
    - `app.json` `ios.associatedDomains` and Android `intentFilters`.
    - `apple-app-site-association` and `assetlinks.json` under `.well-known/`.
    - The `ios/` project needs the entitlement and a native rebuild.
    - `iosUrl` and `androidUrl` in `config/appLinks` are currently empty.

## Decisions (from your reply)

1. **Phase 1 only.** No step 14: no associated domains, intentFilters, AASA or assetlinks, and no changes to `ios/` or `app.json` linking. The landing page opens the app via `bama://c/<token>`.
2. **No `expo-clipboard`.** Native uses `Share.share`. Web uses `navigator.share`, falling back to `navigator.clipboard`.
3. **Owner only.** `allowMemberInvites` is not added to the `Chat` type.
4. **You deploy.** Emulator only, no deploys, no production seeding. I give you exact commands at the end. `resolveCommunityInvite` is excluded from the deploy list (phase 2).
5. **Owner push notification is in scope.** It extends `onCommunityInviteJoinRequest` and adds no new function.
6. **Skipped:** the `CommunityManageModal` cleanup, and everything under step 14.

## Requirement A: resume round-trip trace (before any code)

The only `takeResume` caller is `useSwitchMode.ts:25`. `saveResume` has no caller yet. `activeMode` is restored from `lastMode` by `useAuth.ts:46-61`. `lastMode` is keyed by uid, so a brand-new account starts with `activeMode = null`.

| Rung | Where it routes next | Reaches `switchMode`? |
|---|---|---|
| Login (email, Google, Apple) | `useLogin:24`, `useGoogleSignIn:74,83` and `useAppleSignIn:83,97` replace to `/(auth)/mode-select` | Yes, via the picker's `switchMode(mode)` |
| Register | `useRegister:57` goes to verify-email | Yes, if the next rungs below do |
| Consent | `ConsentForm:77` goes to `nextAuthRoute(...)` | **Brand-new user: yes** (`activeMode` null leads to mode-select). **Returning user with a restored `activeMode`: NO**, it goes to the mode home |
| Verify-email | `VerifyEmailForm:55,59` goes to `nextAuthRoute(...)` | Same as consent |
| Profile setup | `setup.tsx:31` goes to mode-select. The `alreadyDone` branch (`setup.tsx:24`) goes to `nextAuthRoute` | `onDone`: yes. `alreadyDone` branch: same as consent |
| Mode-select | `ModePicker` calls `switchMode(mode)` | Yes. It also sends consent or setup users back to those rungs |
| `switchMode` | `takeResume()` runs before the mode branch, so `/c/<token>` wins over the home in both modes, including an incomplete pro | **This is the consumer** |
| Phone | `phone.tsx:92` does `router.replace('/')`, which goes to `index.tsx` and then `nextAuthRoute` | Not on the way to the preview. The rung lives in the group layouts and `/c/[token]` sits outside them, so the preview never triggers it |
| Client onboarding redirect | In `(client)/_layout`, which applies only when you enter the client group | Not on the way to the preview. It applies to navigation **out of** the preview |
| Pro profile lock | In `(professional)/_layout`, same | Same. Out of the preview only |

**Result: one rung can end without reaching `switchMode`.**
- **Where:** the consent, verify-email and setup `alreadyDone` exits call `nextAuthRoute`, which returns the mode home whenever `activeMode` is already set.
- **Who is affected:** a returning user whose `lastMode` is restored, for example someone hit by a Terms-version bump, or an unverified password account. A brand-new user is unaffected.
- **Effect:** the saved resume is skipped and stays in storage. It then fires unexpectedly on a later mode switch, up to 7 days afterwards.
- **Proposed fix, with no second `takeResume` site:**
  1. Add `hasResume()` to `pendingIntentStore`, a non-consuming peek that applies the same allowlist and TTL check as `takeResume`.
  2. In `nextAuthRoute`, return `/(auth)/mode-select` when a resume is pending, the same way it already does for `activeMode === null`.
  3. Every exit then funnels into the picker and `switchMode`. `index.tsx` uses `nextAuthRoute` too, so the root is covered.
- **Cost:** a returning user opening a link goes through the mode picker once. That matches the cold-launch "always show mode-select" behavior.
- **Tests:** unit-test `nextAuthRoute` with a pending resume.

**Also found, not a gap:** `useLogout` calls `clearAll()`, so declining consent (`ConsentForm:106`) drops the intent. That seems right.

**`saveResume` timing (your requirement):**
- `/c/[token]` saves **before** any redirect fires.
- It checks `useOnboardingGate()` and the signed-out state. If either blocks, it calls `saveResume('/c/<token>')` in an effect, and renders the `<Redirect>` only after the save has completed (a `saved` flag).
- A signed-in but gated user (consent, email, setup) is handled the same way.
- The store's hydration merge already prevents a late AsyncStorage load from clobbering a fresh save.

**Round-trip test (the one you asked for):** a cold open of `/c/<token>` while signed out goes through login, consent, setup and mode-select, then `switchMode`, and lands on the invite preview. I'd also cover the returning-user path through consent with a restored `activeMode`. That is the regression test for the `nextAuthRoute` fix.

## Spec behavior you didn't mention: please confirm

`docs/community-invites-spec.md` (lines ~66-70) says **requesting to join needs professional mode AND a complete pro profile**.
- **Preview:** renders in any mode.
- **Client mode:** an explicit confirm before switching to pro.
- **Incomplete pro:** goes to the profile screen with the invite kept (`afterProfile: requestJoin` in `pendingIntentStore`). On save, the request is sent automatically and they land on the pending preview.
- I'll build to the spec unless you say otherwise. It is a notable product rule, because a client-only user can't join a community from a link.
- **Sitting outside the groups** means the preview does not enforce the phone rung or the client onboarding, so a user with no phone number can still send a request from the preview. The `joinRequests` rules don't require a phone either.

## Revised build order (commit at each checkpoint; `npx jest` and `tsc` clean each time)

1. **Region-aware Functions instance + `inviteService` + i18n keys.**
   - Add the `europe-west1` instance and a region-aware `callFunction`.
   - **Error mapping:** every `getCommunityInvite` and `createCommunityInvite` error code gets its own Hebrew and English string. That covers `unauthenticated`, `permission-denied`, `not-found`, `resource-exhausted`, and each `failed-precondition` reason: unverified email (`אמת את כתובת האימייל שלך כדי ליצור קישור הזמנה`), `demo-isolation`, and `appLinks` missing or not https. There is also a generic fallback.
   - **Emulator:** seed `config/appLinks` in the emulator as part of this step.
   - Mapping tests use the exact server error `code` and `message` strings.
2. **`src/app/c/[token].tsx` + `InvitePreviewScreen`, the resume wiring, and the `nextAuthRoute` and `hasResume` fix, with tests including the full round trip.**
   - **Requirement C:** every navigation out of the invite screen uses an explicit group href, never `/chat/...`. The same applies when `activeMode` is `'professional'`.
   - Targets: `/(client)/chat/...`, `/(professional)/chat/...`, `/(client)/(tabs)/home`, or `/(professional)/(tabs)/profile`, chosen from `activeMode`, as `useNotificationRouting` does.
   - Tests assert the href string for both modes.
3. **Invite row on `community-details.tsx`**, owner only, gated by `isOwner`, with the hooks above the early returns. Native `Share.share`, web `navigator.share` with clipboard fallback, and `showToast`. No `Alert`. Hebrew RTL and English LTR checks.
4. **Owner push in `onCommunityInviteJoinRequest`.**
   - Extend the trigger, with no new function.
   - Reuse the existing notification helpers and the owner's language.
   - Notify only when a request first becomes pending.
   - Test with the emulator.
5. **Landing page in `legal-site/`:**
   - `/c/**` page with an "Open in app" button for `bama://c/<token>`.
   - `/c/**` hosting rewrite in `firebase.json`.
   - **Built but NOT deployed.** The page does not call `resolveCommunityInvite`.

At the end I give you the exact deploy commands, minus `resolveCommunityInvite`.

## Verification (once approved and built)

- `npx jest` and `tsc` clean.
- Emulator: owner creates an invite, a second account opens `/c/<token>`, a pending request appears in the dashboard with `via:'invite'`, the owner approves, and the member shows up.
- Signed-out cold open of `bama://c/<token>`: it logs in, then lands on the preview.
- Restart `expo start --web --clear` before any browser check, per your notes on stale bundles.
- Check both RTL (Hebrew) and LTR.

## Housekeeping

Your convention is to put long reports in `docs/status/*.md`. Plan mode only allows writing this plan file, so I haven't done that. On approval I can copy this report to `docs/status/2026-10-05-community-invite-links-step1.md`.
