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
