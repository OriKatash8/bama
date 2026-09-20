# "Decide on your crew" panel — Step 1 findings

## 1. Where it lives

| | |
|---|---|
| The panel | `src/features/chat/components/candidates/CandidateReviewCard.tsx` (409 lines) — a component, not inline |
| Mounted | `src/features/chat/screens/ChatRoomScreen.tsx:1343-1353`, above the message list, so it never scrolls |
| Shown to | the project's **client only**, on a group chat of an open project (not read-only, not archived) |
| The pro side | a **different** component, `CandidateProCard.tsx` (239 lines): confirm / leave, no paging |

**Shared with the pro card — this is the one thing that needs your decision:**
- `chromeStyles.ts` — the strip shell (white, flush, hairline underneath). **Both** cards use it.
- `ActionButton.tsx` — the three buttons' geometry and colours. **Both** cards use it.
- `useCandidateText.ts` (t/rtl/money) — both. Not a styling file.
- `PriceChangeSheet`, `RejectCandidateSheet` — opened by this card only; out of scope.
- `carousel.ts` — the paging maths. Client card only.

So "restyle the panel" cannot be done in one file without deciding what happens to the pro card. Three options in the report.

## 2. Colours — no `useTheme` in the panel

Every colour in `CandidateReviewCard.tsx`, `chromeStyles.ts` and `ActionButton.tsx` is a hardcoded literal (`#004aad`, `#d64545`, `rgba(15,15,31,…)`). `useTheme` is not imported anywhere under `components/candidates/`. **Nothing in the panel needs a theme change.**

**But the chat background does.** The spec asks for `#EFEBF8` behind the card. The chat room paints `colors.bgGradient` from `useTheme` through a `LinearGradient` (`ChatRoomScreen.tsx:1208`); the light theme value is `['#E6E0F4', '#D0DFF7']`. Options: leave it, or pass a literal to that one `LinearGradient` (a local override, not a theme edit) — which repaints **every** chat room, including DMs, purchase and community chats, not only the project chats this panel appears in. Your call.

## 3. How it pages today

Not a ScrollView and not a FlatList: **index state** (`shownId` → `resolveShownIndex`) with an `Animated.Value` sliding the row.

- **Chevrons** — inside the member row, one at each end, mirrored for RTL (`ChevronLeft`/`ChevronRight` swap), disabled at the ends at `opacity 0.25`.
- **Dots** — under the row, above the buttons (not under the buttons), with `accessibilityLabel="2/3"`.
- **Swiping already works.** A `PanResponder` (`carousel.ts`) tracks the finger 1:1, resists past the first/last member (`dragOffset`, ÷4), commits past a 40px threshold, and plays a 150ms slide. Direction is mirrored in Hebrew (`swipeStep`, `exitSign`, `slidePlan`).
- Two deliberate behaviours a `FlatList` would take over:
  - `startedAtEdge` leaves a 32px strip at each screen edge to the screen's own back-swipe.
  - `onSwipeableChange` tells `ChatRoomScreen` to disable its back gesture while the card can be swiped (`gestureEnabled: !cardSwipeable`).

## 4. Do the buttons act on the shown member?

**Yes.** In carousel mode the card renders `renderRow(candidates[shownIndex])` — exactly one member's row exists at a time, and its three buttons close over that member's `c`. With one member it renders `candidates[0]`.

## 5. Single member?

**Yes**, and it is the common case. `carousel = candidates.length > 1` gates the chevrons and the dots; the whole card returns `null` when nobody is under review.

## 6. What changes the row's height

| Piece | Varies? |
|---|---|
| Name | always; `numberOfLines={1}`, ellipsizes |
| Role line | always; `numberOfLines={1}` — **cannot wrap today**, `c.roles.map(r => r.label).join(' · ')` |
| Price | always present (`money(c.total)`) |
| Confirmed line `✓ {name} אישר/ה` | **only** when `c.proAccepted && resolved` |
| "Waiting for {name} to answer" | **only** while a price change is pending *on the pro* |
| "{name} proposed a new price — view and answer ›" (tappable) | **only** while a price change is pending *on the client* |

The last two are **not in the spec's four parts**. They are per-member, so they belong inside the paging area; they are also why the card's height moves today. Both are mutually exclusive with each other, never with the confirmed line.

Also per-member: `Relevant` and `Change price` are disabled while any price change is pending for that member, and each button can show a spinner.

## 7. Tests that pin the current shape

`CandidateReviewCard.test.tsx` is 739 lines / 69 tests. Rewritten by this redesign: the dots (`carousel-dots`, `carousel-dot-{i}`, their `accessibilityLabel`), the chevrons' position inside the identity row (`children[0]` / `children[last]`), the `rowCarousel` padding arithmetic asserted by reading the stylesheet source, and the edge-zone tests if the gesture changes. Roughly 15 of the 69.

## 8. The copy question you asked about

`candidate_review.relevant` today: **"Relevant"** / **"רלוונטי"**. No placeholder.

`t()` from `useCandidateText` interpolates `{{var}}` already (`t('candidate_review.confirm_title', { name })` is the same helper), so `"Relevant for {{name}}"` / `"רלוונטי ל{{name}}"` would work with no code change beyond passing `{ name }`.

Two things to weigh: the name can be long, and the three buttons are `flex: 1` in one row — the spec's "wrap to 2 lines, equal heights" makes that survivable, but a long Hebrew name still ellipsizes inside a third of the row. And `name` is empty until `useUserBasics` resolves; the button would read "Relevant for" for a moment unless it falls back to the plain label.
