# Pre-existing Firestore rule holes (report only, nothing changed)

Date: 2026-10-03. Found while mapping contact paths for the demo-account isolation work
(`docs/status/2026-10-03-demo-accounts-phase1.md`). None of these involve the demo accounts. The
same-side rules added for that work stop each of these **between demo and real users** only. Between
two real users they behave exactly as described here.

**No rule has been changed.** Each fix below waits for a separate approval and will be verified on
the emulator against the app's exact writes before it is deployed.

Line numbers refer to `firestore.rules` at commit `7597174`.

---

## 1. A chat can be created without the caller in it, and with any `ownerId`

**Rules:**
- `firestore.rules:572-574`: create needs only `isAuth() && verified()`, `type != 'community' || isAdmin()` and `dmNotBlocked()`.
- `:601-603`: `isChatOwner()` is `resource.data.ownerId == auth.uid`.
- `:674`: an owner may change `members` freely.

**What is not checked on create:** that the caller is in `members`, the size of `members`, the `type` (only `community` is restricted), and fields such as `ownerId`. `dmNotBlocked()` (`:563-570`) runs only for a `dm` with exactly 2 members.

**Abuse:**
- A verified user creates `chats/x = {type:'group', members:[victim1, victim2, …], ownerId: me, name:'…'}`. It appears in each victim's chat list (`listenToUserChats` reads `members array-contains uid`).
- A `dm` with 3 members skips the block check entirely.
- Having set `ownerId` to themselves, the creator can add or kick anyone later through `:674`.

**App writes that must keep working:**
- `getOrCreateDM` creates `{type:'dm', members:[me, other]}` (`chatService.ts:148`).
- `createPurchaseChat` creates `{type:'purchase', members:[buyer, seller], purchaseListingId, buyerName, name}` (`chatService.ts:165`).
- The admin community create (`chatService.ts:196`, batch) sets `ownerId` to the requester.
- Project group chats are made only by `hireProfessional` (Admin SDK). The client `createProjectGroup` is never called.

**Proposed fix (create):**
```
allow create: if isAuth() && verified() && dmNotBlocked() && (
  isAdmin() ||                                   // community create (any ownerId)
  ( request.auth.uid in request.resource.data.members
    && request.resource.data.members.size() == 2
    && request.resource.data.type in ['dm', 'purchase']
    && !request.resource.data.keys().hasAny(['ownerId', 'roles', 'readOnly', 'status'])
    && (request.resource.data.type != 'purchase'
        || get(/databases/$(database)/documents/marketplace_listings/$(request.resource.data.purchaseListingId))
             .data.posterId in request.resource.data.members) )
);
```
Group chats from clients are denied, since only the server creates them. That costs at most 3 reads (2 block checks and the listing).

---

## 2. A project can be created in another user's name

**Rule:** `firestore.rules:878-883`. Create checks `status == 'open'`, an empty `filledSlots`, and no server-only fields. **It never checks `clientId == request.auth.uid`.**

**Abuse:**
- A creates `projects/x = {clientId: B, title:'…', status:'open', crewSlots:[…]}`.
- `onProjectCreate` broadcasts a "new project" push to every matching pro *in B's name*.
- B finds a project in their list that they never made.
- With `targetProfessionalId` set, A can also put a direct request in front of any pro, in B's name.

**App writes that must keep working:** `useProjectRequests.ts:68` and `DirectProjectSheet.tsx:224-237`. Both write `clientId: user.id`, the caller.

**Proposed fix:** add one line to the create condition:
```
request.resource.data.clientId == request.auth.uid &&
```
It needs no extra reads. The update rule (`:891`) already requires `resource.data.clientId == request.auth.uid`.

---

## 3. A review needs no completed engagement

**Rule:** `firestore.rules:1162-1165`. Create checks only `reviewerId == auth.uid`, `professionalId != auth.uid`, and that `published`/`visibleAt` are absent.

**Abuse:** any verified user can post any star rating about any professional, with or without a `projectId` and with no hire. `onReviewCreate` publishes it at once and it counts toward the pro's public rating. This allows review bombing, or a pro boosting themselves from a second account.

**App write that must keep working:** `ReviewFlow.tsx:113-129` writes `{projectId, professionalId, reviewerId, …}`. It runs after the client's `confirmCompletion` (`project-details.tsx:503-544`), and by then the server has set the pro's fee doc to `engagementStatus:'completed'`.

**Proposed fix:**
```
allow create: if isAuth() && verified() &&
  request.resource.data.reviewerId == request.auth.uid &&
  request.resource.data.professionalId != request.auth.uid &&
  !request.resource.data.keys().hasAny(['published', 'visibleAt']) &&
  get(/databases/$(database)/documents/projects/$(request.resource.data.projectId)).data.clientId == request.auth.uid &&
  get(/databases/$(database)/documents/projects/$(request.resource.data.projectId)/fees/$(request.resource.data.professionalId))
    .data.engagementStatus == 'completed';
```
This costs 2 reads.

**Open question before applying:** should one review per (project, pro) be enforced? The doc id could become `{projectId}_{professionalId}` with `!exists(...)`. That needs a matching change in `ReviewFlow` and a client build.

---

## 4. Any user can reserve any available listing, and either party can forge the other's agreement

**Rules:**
- The new-buyer clause, `firestore.rules:1101-1107`, lets *anyone* move an `available` listing to `reserved` with `buyerId = self`, given only the three `acceptDeal` fields. It does not check that `purchaseChatId` is a real purchase chat for this listing with this seller, or that the seller agreed.
- Related: `sellerAgreed` and `buyerAgreed` are in `chatMemberFields()` (`:614-620`), so **either member can write the other party's agreement flag**.

**Abuse:** a user who never talked to the seller reserves the listing (`{status:'reserved', buyerId: me, purchaseChatId:'anything'}`). The item disappears from the market and the seller has to cancel it by hand. Inside a real purchase chat, the buyer can set `sellerAgreed:true` themselves.

**App writes that must keep working:**
- `acceptDeal` (`marketplaceService.ts:93-133`) is run by whichever party presses "agree" second. It batch-writes the listing (`status`, `buyerId`, `purchaseChatId`) and the chat (`sellerAgreed:true, buyerAgreed:true`).
- `setAgreement` (`marketplaceService.ts:80`) writes one's *own* flag (`PurchaseBanner.tsx:103`).

**Proposed fix:**
- Listing, new-buyer clause. Add:
  ```
  let c = getAfter(/databases/$(database)/documents/chats/$(request.resource.data.purchaseChatId)).data;
  c.type == 'purchase' && c.purchaseListingId == listingId
    && request.auth.uid in c.members && resource.data.posterId in c.members
    && get(/databases/$(database)/documents/chats/$(request.resource.data.purchaseChatId)).data.sellerAgreed == true
  ```
  The seller must already have agreed *before* this batch, and the chat must bind this buyer to this listing's seller. This costs 1 document (get and getAfter of the same path).
- Chat update: a non-seller may only set `buyerAgreed`, and a seller may only set `sellerAgreed`. The exception is `acceptDeal`'s batch, which sets both when the other flag was already true. Concretely: `sellerAgreed` may change only if `auth.uid` is the listing's `posterId`, or `resource.data.sellerAgreed == true` already. The same applies for the buyer. That is +1 read (the listing) on agreement writes only.
- **Must be emulator-tested against both orders**: buyer agrees second, and seller agrees second.
