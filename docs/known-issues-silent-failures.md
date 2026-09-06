# Known issues — silently swallowed errors

> ## ⚠ PENDING DEPLOYS — read this first
>
> Follow-ups that are written but deliberately **not yet deployed**, each with the
> trigger that releases them. These are the ones that get dropped once the
> immediate problem looks solved.
>
> ### 1. `paymentRequests` → `allow create: if false`
>
> **Trigger: deploy after the app build carrying the `createPaymentRequest`
> callable ships.**
>
> Creation moved server-side, but the rule is currently the *interim* form:
>
> ```
> allow create: if isAuth()
>   && request.resource.data.fromUserId == request.auth.uid
>   && request.resource.data.toUserId != request.auth.uid;
> ```
>
> That already closes the self-addressing hole, and it keeps installed builds
> working — they still create these documents directly. Once the new client is
> out, replace it with `allow create: if false;` so the document is fully
> server-owned. Verify afterwards that a direct client `addDoc` into
> `projects/{id}/paymentRequests` is denied.
>
> Deploy: `firebase deploy --only firestore:rules`.


Catch blocks and error handlers that discard the real failure. Each one turns a
specific bug into "something went wrong" or, worse, into a plausible-looking
empty state. Recorded 2026-09-04, from the removal-flow investigation.

**Why this list exists.** A bare `catch` in `project-details.tsx` hid a Firestore
rules denial on repeat removal requests indefinitely: the client pressed "remove",
the write was denied, and the only symptom was a generic alert. The bug was found
by reading production data, not by anything the app reported.

Two shapes appear below. The second is more dangerous.

1. **Generic alert** — the user is told *something* failed, but the cause is gone.
2. **Silent empty** — the failure is rendered as legitimately-empty data. Nobody,
   user or developer, has any signal at all.

---

## Shape 2 — failures rendered as empty data (fix these first)

| Location | What it hides |
|---|---|
| `src/features/chat/services/removalService.ts:63` | `onSnapshot(..., () => callback([]))`. A rules denial on the removal-requests listener renders as **"no pending removals"**. This was the first hypothesis for the removal bug — it happened not to be firing, but the shape is live and is the one most likely to bite next. |
| `src/app/(client)/(tabs)/chats/project-details.tsx:263` | `.catch(() => [] as PriceOffer[])`. A failed price-offer query renders the project with **no prices at all**, indistinguishable from a project nobody has bid on. |

## Shape 1 — bare `catch {` replacing the error with a generic alert

All in `src/app/(client)/(tabs)/chats/project-details.tsx`. None captures the
error; none logs.

| Line | Handler |
|---|---|
| `:319` | `handleMarkComplete` — fee calculation |
| `:341` | `handleConfirmComplete` — the already-reviewed branch |
| `:422` | `handleSendPaymentRequest` |
| `:461` | `handleRespondToRequest` — price accept/reject |
| `:536` | `submitReport` |
| `:576` | `handlePostRoles` |
| `:665` | `handleAddMeeting` |
| `:711`, `:721` | mission status update / delete |

### Fixed 2026-09-04

- `:481` `handleRequestRemoval` — **this is the one that hid the bug.**
- `:556` `handleAcceptRemoval` — swallowed `freeSlot` failures including the
  deliberate `'Cannot leave a confirmed project with a fee outstanding'`, so a
  professional blocked by an unpaid fee was told only "error".

Both now `console.error` the real error alongside the existing alert.

## Doing it correctly already

`:183` (edit deadline), `:369` (`confirmCompletion`) and `:692` (`handleAddMission`)
capture and `console.error` the real error; `:692` surfaces the message to the user.
`:416` is a deliberate, documented swallow of a non-critical chat notice.

---

## Suggested rule

A `catch` may discard an error only when the failure is genuinely non-critical
**and** a comment says why (as `:416` does). Otherwise capture it and
`console.error` — the alert can stay generic, but the cause must reach the logs.
Never resolve a failed fetch to an empty collection without logging: an empty
list is a legitimate state, so that failure mode is invisible by construction.

---

## Update 2026-09-04 — two more fixed, one class understood

`useSearchProfessionals.ts:44` and `useUnifiedSearch.ts:51` both had
`.catch(() => [] as Review[])` on the reviews fetch. A permission denial there
renders as **"no reviews" and a 0.0 rating** — indistinguishable from a brand-new
professional, on the browse and search cards. Both now log before falling back.

That mattered more than it looked: the reviews query was simultaneously
*changed* to require `where('published','==',true)`. Had these kept swallowing,
a mistake in that constraint would have silently zeroed every rating on the
platform rather than surfacing an error.

**The pattern to watch.** Every instance found so far sits on a Firestore read
whose rule can deny it. A denial is not an exception the user recognises — it
arrives looking exactly like legitimately-empty data. Two production bugs in this
codebase have now been caused by it (the removal banner, and nearly the ratings),
and both were invisible in the logs.

---

## Marketplace fee — removed from copy 2026-09-04, dead code left behind

**Decision: BAMA charges no fee on marketplace transactions.** Not now, possibly
in future.

The fee was never actually charged. The only calculation,
`Math.round(listing.price * 0.03)`, was deleted on 2026-08-20 in `ecbdfe5`
("Talk with the Seller replaces instant buy"), whose own message records
"no platform fee at chat-open time". No payment integration ever existed.
`onMarketplacePurchase` sends a notification and touches no money.

What was left was copy describing a fee nobody was charging — six strings, two of
them live in front of real users. Those are now gone.

### If a marketplace fee is ever introduced

**It gets its own rate in `src/core/constants/pricing.ts`, mirrored in
`functions/src/pricing.ts` — it does NOT revive any of the below.** The project
fee (`PLATFORM_FEE_RATE`) is 3% of what each professional is paid on a completed
project; a marketplace rate is a different thing that happened to share a number.
Reusing that constant would silently couple two unrelated prices, so that when
one moves the other moves with it.

### Left in place deliberately, worth cleaning before launch

| Item | Why it is still here |
|---|---|
| **13 listings with a stale `platformFee`** | **The one that matters.** 12 sold, 1 reserved, each exactly 3% of price (₪5,000 → ₪150). Written before 2026-08-20. Real numbers on real documents implying a fee was assessed, and nothing reads them. Clean these before launch. |
| `src/features/marketplace/components/CheckoutModal.tsx` | Orphaned — nothing imports or mounts it since `ecbdfe5`. Still references `marketplace.platform_fee` and `marketplace.fee_note`, which no longer exist; its `makeT` returns the key on a miss, so it degrades to raw key text rather than crashing. Never rendered, so no user impact. |
| `MarketplaceListing.platformFee?: number` and its `deleteField()` in `cancelPurchase` | No write site anywhere in `src/`, `functions/` or `scripts/`. The `deleteField()` clears a field nothing sets. |
| `// STRIPE CHARGE GOES HERE` at `marketplaceService.ts:162-165` | A placeholder referencing `listing.platformFee`. Reads as though a charge is pending when none is. |

### Why the `fee_charged` alert was deleted rather than reworded

It existed only to announce the fee, so there was nothing left to say. Removing
it leaves no gap: `listenToPurchaseContext` is a live listener, so the banner
re-renders on its own — `sale_completed_label` when both sides have confirmed,
`waiting_seller` when only the buyer has — and `confirmReceived` posts
`sale_complete` into the chat the buyer is already looking at. Two independent
signals in each branch. It was also an `Alert.alert`, which no-ops on web, so
web buyers never saw it in the first place.

---

# Self-hire: a client can hire themselves onto their own project

**Reachable today, and already present on 6 production projects** (one of them
`completed`). Not fixed — recorded 2026-09-04 so it is a decision rather than a
surprise.

## How it happens

Nothing blocks it at either step:

- `priceOffers` create only requires `request.resource.data.professionalId ==
  request.auth.uid` — you may bid on your own project.
- `hireProfessional` → `loadAndEnforce` only requires `project.clientId == uid`
  — you may accept it. There is no `clientId !== proId` guard anywhere in
  `functions/src/lifecycle/hire.ts`.

The notification triggers *do* guard against it (`if (clientId ===
offer.professionalId) return`), which suggests it was noticed at the
notification layer and never pushed down into the hire path.

## What it costs

- **A slot.** The self-hire lands in `slotHolders`, so it counts against the
  non-subscriber cap of 2 exactly like real work, and against a subscriber's
  monthly limit of 10.
- **A fee.** A `fees/{proId}` document is written with the normal status, so on
  client-confirmed completion the platform fee falls due — on a transaction where
  no money moved between two parties. The completed self-hire above is the shape
  that would bill someone for paying themselves.
- **Fee-document readability.** Fee docs are readable by the professional and
  denied to the client (§6). Under self-hire those are the same person, so the
  "client never learns the professional owes money" property is vacuous.

## How the UI resolves it (already implemented)

Wherever a role decides what to render, **the client variant wins**: chat-list
row copy, and the fee listeners in `project-details` and `ChatRoomScreen`. The
reason is written at each site — no money moved between parties, so there is no
fee to present and nothing to settle. This keeps the UI coherent; it does **not**
stop the fee being assessed server-side.

## FIXED 2026-09-04 — rejected outright in `loadAndEnforce`

`proId === project.clientId` now throws `failed-precondition`
(`cannot-hire-yourself`). The six existing projects needed no migration: all
pre-date the pricing model, carry **no fee documents** and hold **no slots**, and
the completed one never ran `confirmCompletionInternal` (`completion` is still
`none`), so **no money was ever owed on any of them**.

### Why blocking, not "skip the fee and the slot"

`commitHire` does **four** things per hire, not two:

| | neutralised by "skip fee and slot"? |
|---|---|
| `fees/{proId}` document | yes |
| `slotHolders` / `slotActive` | yes |
| **subscriber `monthCount` increment** (`hire.ts:146-149`) | **no** |
| `filledSlots` / `professionalIds` / chat membership | kept on purpose |

A subscriber self-hiring would still burn one of their **10 free projects that
month** on a transaction where nobody paid anybody — the same error as the fee,
in the field the neutralising approach does not reach.

### The decisive reason: self-review, not the fee

`reviewsPending` is built from `filledSlots` (`project-details.tsx:393`), so
completing a self-hire prompts the client to review **themselves**, and the
result counts toward their own public rating. That is a ratings-integrity hole,
not a pricing bug, and neutralising the fee would not have touched it.

**It has already happened.** `reviews/KGWJrEi3GIa52tRoNi9N` on project
`12MgwfyuVyhNf7OcGrvr`: `professionalId === reviewerId`, **rating 5,
`published: true`**. It is that account's *entire* public rating — 5.00 from one
review; without it they have no rating at all. Left in place deliberately:
removing real user data is a separate decision, not a side effect of a code fix.

### The roster case

"I direct and I also edit" is a real need, and blocking self-hire removes it. It
deserves its own **add-yourself-as-crew** path that writes `filledSlots` without
a fee, a slot, a counter increment or a review prompt — rather than routing a
person through hire-and-charge and then unwinding three of its four effects.

---

# Capability is lost at the offer boundary — reachable from 2026-09-04

**Not a swallowed error, but the same failure mode: a real mismatch that renders
as legitimately-empty data.** Recorded when the role picker started writing
capability-bearing slots.

## The asymmetry

Slots are identified by **(category, requiredCapability)** — `sameSlotKind` in
both copies of `matching.ts`. Offers are identified by **category alone**:

- `PriceOffer` (`src/core/types/project.ts`) has no `requiredCapability` field.
  Its `subcategory?` is a different, unrelated concept and is not written by the
  noticeboard path.
- `ProjectDetailModal`'s submit maps bids down to `{ category, price }`,
  discarding the `requiredCapability` that `getVacantSlots` put on them.

So the read path is capability-aware and the write path is not.

## Why it was dormant, and why it is not any more

Until 2026-09-04 the "add professional" picker discarded the subcategory
entirely, so **every slot in production was a general slot** and the distinction
never arose — `crewSlots` on real projects are all `{category, quantity}`. Fixing
the picker means projects can now carry a `drone` slot and a `general` slot in
the same category.

## What it will look like

Anything reasoning about "which slots has this pro already bid on" can only
resolve to category. The first consumer is the noticeboard's
"still has an unoffered matching slot" check, which decides whether a project
stays visible after the pro bids on one of its roles. On a project with both a
`drone` and a `general` slot in one category, bidding on **either** marks the
category done and the project disappears — with the other slot still vacant.

The pro sees a project quietly stop appearing. There is no error, no empty state,
nothing in the logs; the board just has one fewer card. That is exactly the shape
this document exists to catalogue, and it will present months later as "the
noticeboard is hiding projects I can still bid on".

## The fix, when it is worth doing

Add `requiredCapability?: string` to `PriceOffer` and to `BundleOffer.slots[]`,
carry it through the modal's submit, and key the already-offered check on
(category, capability). It is a schema addition, not a migration: existing offers
having no capability is indistinguishable from the general slots they were
actually made against, so old data reads correctly under the new shape.

Deliberately deferred — recorded so the eventual symptom has a cause.

---

# marketplace_listings: an update rule that checked who, never what

**FIXED 2026-09-06.** Recorded because the shape is the same one this document
already catalogues twice, and because the fix has a trap in it.

## What was open

```
allow update: if isAuth() && (
  A:  resource.data.posterId == request.auth.uid ||
  B:  resource.data.buyerId  == request.auth.uid ||
  C: (resource.data.status == 'available' &&
      request.resource.data.buyerId == request.auth.uid)
);
```

Clause C existed so a second buyer pressing "Agree" could run `acceptDeal`. It
granted **any signed-in user the right to write any fields to any `available`
listing**, on the single condition that the result carried their own `buyerId`.
No `affectedKeys()` guard, no transition check, no field allow-list — while
`bundleOffers` twelve lines above and `projects` both had exactly those.

Clause B compounded it: once `buyerId == self` was written — which C permitted
unilaterally — that user kept write access **forever, whatever the status became**.

**Verified in production against the live rules before the fix**, from a throwaway
account acting on another account's listing. Every one of these succeeded:

| Write | Effect |
|---|---|
| `posterId: self` | Listing theft — clause A then holds permanently, and `allow delete` is `posterId == uid` |
| `status: 'sold'` | Denial of service — `useMarketplaceListings.ts:15` filters `sold` out of the feed |
| `price`, `productName` | Vandalism / price manipulation |
| `sellerConfirmed: true` | Forges the seller's half of the handover handshake |
| `status: 'negotiating'` | A value no code path writes, reachable by hand |

An existing buyer could additionally rewrite the price, steal the listing, forge the
seller's confirmation and **install a different buyer** on their own reserved listing.

## Exposure at the time of the fix

28 listings: 6 `available` (clause C applied — any user, any field), 2 with no
`status` (C did not apply, `undefined != 'available'`), 20 `reserved`/`sold`. All 20
carried a `buyerId`, so 20 users held permanent write access via clause B.

**Nothing had come through it.** All 28 were audited against the invariants the code
maintains: no `buyerId === posterId` self-deals, no `buyerId` without a
`purchaseChatId`, no `buyerId` on an available listing, no `'negotiating'`, no
confirmation flags without a reservation, no `posterId` pointing at a missing user,
and no `posterName` drifted from the owner's real `displayName` — the trace a
rewritten `posterId` would leave. The only anomalies were the 13 known stale
`platformFee` values and one `buyerId` pointing at a deleted account.

## The trap in the fix

The obvious buyer-side constraint — *"a buyer may only ever set `buyerId` to
themselves"* — **breaks seller-side acceptance.** `acceptDeal(listingId, chatId,
buyerId, userId, …)` passes the BUYER's uid regardless of which party presses Agree
second, so when the seller accepts, the seller legitimately writes somebody else's
uid. Only the *buyer* clause may restrict `buyerId` to self-or-cleared; the seller
clause must not.

Second trap: `cancelPurchase` **deletes both** `sellerConfirmed` and
`buyerConfirmed`, so a rule that simply forbids each party touching the other's
confirmation blocks cancellation. `notForgingConfirmation(field)` allows the field
to be REMOVED and only its owner to SET it.

Both would have passed a denied-set-only test and broken the live sale flow.

## Why the probe asserted both directions

The hole had been open for months and nobody used it; the sale flow is used by 25
live listings. **A false denial was the worse outcome**, so the probe asserted the
legitimate writes as well as the hostile ones, and ran twice: once against the old
rules (proving the hole real AND every legitimate write already passing, so any
later failure was attributable to the change), then again after deploying. 19/19
both times. `scripts/probe-marketplace-rules.mjs`, `--baseline` for the first run.

**The emulator would not have been sufficient** — see the entry below on verification
residue, and note the rules here depend on `request.resource.data` diffs whose
behaviour is worth confirming against the real service.

---

# Deferred marketplace work, recorded so it is not lost

Both deliberately postponed on 2026-09-06 in favour of the rules fix above.

## Dead marketplace UI (~460 lines) — delete post-launch

| File | Lines | Why it is dead |
|---|---|---|
| `CheckoutModal.tsx` | 233 | Orphaned — not even in the barrel. References `marketplace.platform_fee` / `fee_note`, which no longer exist |
| `RentalGrid.tsx` | 70 | Superseded by the inline grid in `marketplace/index.tsx` |
| `RentalCard.tsx` | 90 | Only used by `RentalGrid` |
| `SecondHandList.tsx` | 69 | Superseded by the same inline grid |

Note the *rental-specific* components are the unreachable ones. Also dead in the
data model: `reservedBy` / `reservedAt` (declared, never written or read — 0 in
production), `'negotiating'` (declared and filtered on, never written), and
`platformFee` (never set; the charge is a comment at `marketplaceService.ts:162-165`).

## Rental availability calendar — investigated, deferred

Goal was: a renter sees which dates are taken, from owner blocks plus confirmed
rentals. Stopped because the second source does not exist and the rules hole above
was the more serious finding.

What the investigation established, so it need not be repeated:

- **`bookings/` is dead scaffolding.** `onBookingCreate` is deployed but unreachable
  (no `match /bookings/`, so the catch-all denies every client write); 0 documents;
  the client feature is three empty barrel files and a placeholder screen; the tab is
  `href: null`. The `Booking` type has **no date** — it models an assignment, not a
  period. Nothing to reuse.
- **Rentals reuse the sale flow verbatim.** `type: 'rental'` changes an emoji, a
  badge and a `/day` suffix. `price` is documented as a daily rate and is never
  multiplied. One of the three production rentals is marked `sold`. Duration exists
  only as free text in chat.
- **`MiniCalendar` is single-date** and cannot mark a set of busy days — only a
  contiguous `minDate`..`maxDate`. It is also not RTL-aware, not themed, hardcoded
  English, and renders its own Modal. It has 8 mount sites, so it should be left
  alone and a dedicated component built instead.
- **No date library is installed and none is needed** — the app is `'YYYY-MM-DD'`
  strings plus lexicographic comparison.

Sizing if it resumes: **Slice A ≈900 lines + 2 deploys** (server-authoritative rental
agreement) and **Slice B ≈650 lines, no deploy** (availability calendar).

Two decisions worth keeping:

1. **Overlap must be enforced in a transaction against ONE document** — keep the
   busy set denormalised on the listing so the race-critical read is single-doc.
   **Do not copy `hireProfessional`**: it reads state then commits a `db.batch()`
   with no transaction (`hire.ts:93,165`), so its own slot-cap check has a TOCTOU
   race. `completion.ts:256` is the only real transaction in the repo and is the
   right precedent.
2. **Rental overrun is unmodelled.** With plain ranges the dates free themselves at
   `end`, so late-returned gear shows as available. Preferred handling is to block
   `[start, max(end, today)]` while accepted and stop only when the owner marks
   returned — a false-busy day is a smaller harm than a double-booking.

---

# Copy that lives in components, invisible to any string audit

Recorded 2026-09-06, after a grep for hardcoded English nearly missed it.

## The shape

Some user-facing copy is written as an inline bilingual ternary at the call site
rather than as a key in `he.json` / `en.json`:

```ts
const confirmed = await confirmDialog(
  rtl ? 'הסרת צ׳אט' : 'Remove chat',
  rtl ? 'האם להסיר צ׳אט זה מהרשימה שלך?' : 'Remove this chat from your list?',
);
```

Known instances: `ChatsScreen.tsx` (`handleLeaveChat`), and the noticeboard
search placeholder in `dashboard/index.tsx`. Others almost certainly exist —
this pattern is what makes them hard to enumerate.

## Why it is worth recording

**Nothing is broken.** Both languages render. That is exactly the problem: it
looks correct in both, so no test, no type and no reviewer catches it.

What it defeats is *auditing*. The he/en parity check run after every string
change compares key sets in the two locale files — copy that never enters those
files is invisible to it. A search for untranslated text finds hardcoded English
(`<Text>No listings found</Text>`) but not a ternary that already contains both
languages. So this copy cannot be counted, reviewed by a translator, reused, or
changed in one place.

It also silently sets a second convention. Someone copying a nearby line gets
the ternary, not `t()`, and the split widens.

## Why the greps nearly missed it

A hardcoded-English sweep matches on *English text where a key was expected*.
These lines contain the Hebrew too, so they pass every heuristic aimed at
untranslated strings. They only surfaced while reading `confirmDialog` call
sites to check whether they used `t()` — i.e. by accident.

The lesson generalises: an audit that looks for *missing* translations cannot
find copy that was translated in the wrong place.

## The fix, when it is worth doing

Move each pair into `he.json` / `en.json` under the owning namespace and call
`t()`. Mechanical and low risk — the strings already exist in both languages, so
it is a move, not a translation. Deferred deliberately; recorded so the next
string audit knows its own blind spot.

---

# Related: mode was standing in for role

Fixed 2026-09-04, in the same pass. The chat list, `ChatRoomScreen`'s fee
listener and the subscription menu row all branched on `activeMode` where they
meant "my role on this project". A client who switched to professional mode was
told to pay a fee on their own project; a professional browsing as a client lost
the pay button on a project they owed on, and could not reach their own
subscription.

**Mode picks which tab you are in. It does not decide who you are on a given
project.** Role comes from `project.clientId` and `project.professionalIds`.
`modeSegment` routing is the legitimate use of mode and stays.


---

# The identity gap: two rules each checking a different half of one person

The self-hire bug is one instance of a shape worth recognising. A permission is
split across two places, each checking a different party, and neither notices
they are the same person.

| Site | One half | The other half | Status |
|---|---|---|---|
| **hire** | `priceOffers` create: `professionalId == uid` | `hireProfessional`: `clientId == uid` | **fixed 2026-09-04** |
| **reviews** | create: `reviewerId == uid` | nothing checked `professionalId` | **fixed 2026-09-04** |
| **paymentRequests** | create: `fromUserId == uid` | `respondToPaymentRequest`: `toUserId == uid` | **OPEN** |
| marketplace | — | — | guarded only in the `onMarketplacePurchase` notification; 0 instances |

## OPEN: paymentRequests can be addressed to yourself

A party can create a request with `fromUserId: me, toUserId: me,
professionalId: <the other party>` and then accept their own request —
`respondToPaymentRequest` only checks `req.toUserId === uid`. That unilaterally
reprices an accepted offer, which is **the platform fee's base**.

Zero instances in production today. The fix is symmetrical to the others: refuse
when `fromUserId === toUserId`, and ideally verify that the caller is actually a
party to the project rather than trusting the request's own fields.

## The lesson

When authority is split across a rule and a callable, or across two rules, ask
whether one person can satisfy both halves. The individual checks all look
correct in isolation — that is exactly why this shape survives review.


---

# My own verification code left residue in production

Recorded 2026-09-04, against myself, because it is the same failure this document
exists to catalogue — in the code whose entire job is to prove things are clean.

## What happened

Every production probe in this work printed `cleanup: … removed` and returned
zero failures. Two of those claims were false:

1. **The review deletion never ran.** The probe called `ref.delete()` on a
   **client-SDK** `DocumentReference`, which has no such method — the client SDK
   uses `deleteDoc(ref)`; only the Admin SDK puts `.delete()` on the reference.
   It threw a `TypeError`, an **empty `catch {}`** swallowed it, and the loop
   reported success.
2. **Deleting an auth user does not delete its Firestore document.**
   `createUserWithEmailAndPassword` fires the auth-create trigger, which writes
   `users/{uid}`. Removing the auth record leaves that document behind.

Net residue in production: **15 orphan `users/` documents** and **1 scratch
review**, accumulated across a day of probes. Found only because an unrelated
count moved from 7 to 8. Since removed, guarded on the unroutable
`@bama-invalid.test` domain and the scratch project id, and verified afterwards.

## The rule

**Verification code with an empty catch is worse than application code with one.**
App code that swallows an error shows the user a wrong screen. A probe that
swallows an error *reports success* — it actively asserts the thing it failed to
check, and everything downstream is then reasoned about on a false premise.

**Probe cleanup must assert what it deleted, not assume it.** Re-read after
deleting and fail loudly if anything survives. Never `catch {}` in a teardown
block; if a delete can legitimately fail, say why in a comment, as anywhere else.

Four specific traps, all of which have actually bitten:

- **Client SDK vs Admin SDK deletion.** `deleteDoc(ref)` versus `ref.delete()`.
  Mixing them fails at runtime, not compile time, in a place nobody reads.
- **Auth deletion leaves Firestore behind.** Any throwaway account created
  through the client SDK needs its `users/{uid}` document — and anything the
  create-trigger wrote beneath it — removed explicitly.
- **The create-trigger races the teardown.** `onUserCreate` writes `users/{uid}`
  asynchronously, so deleting that document *before* the auth record can lose the
  race: the trigger lands afterwards and re-creates it. Caught by an asserting
  teardown that found exactly one survivor. **Delete the auth account first**, then
  the documents, then sweep once more after a short pause.
- **A brand-new 2nd-gen callable is briefly uninvokable.** Immediately after a
  `create` deploy the client gets `functions/unauthenticated` while the
  `allUsers` run-invoker binding propagates. That is not an auth bug in the
  callable — check `gcloud run services get-iam-policy` before chasing it, and
  retry.
