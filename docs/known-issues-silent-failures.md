# Known issues — silently swallowed errors

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

## If it is fixed later

The cheap guard is in `loadAndEnforce`: reject when `proId === project.clientId`
with a `failed-precondition`. That stops new ones. The six existing projects
would need deciding separately — particularly the completed one, where a fee may
already be recorded.

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
