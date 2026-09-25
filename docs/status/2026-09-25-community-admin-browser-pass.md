# Community admin dashboard — browser pass (read-only)

Checkpoints 3 (`3ca9476`) and 4 (`7256e77`) are unverified until this pass.
Run it together on web at localhost:8081 with Chrome connected.

**Read-only. Never press Approve, Reject, Approve all, or the second tap of
Remove.** The first tap of Remove and its Cancel are safe (they write nothing).

## Decide before starting: what the charts can show on production

The web app talks to the real project (`bama-af0a0`); there is no emulator
wiring. With production as it is today:

| Data | Production state | What the pass will see |
|---|---|---|
| `communityEvents` | rules not deployed → reads denied | flow chart empty state, net growth 0, no "joined X ago" |
| `memberStats` | rules not deployed → reads denied | every activity bar a sliver, all counts 0 |
| market listings | `(type, timestamp)` index not deployed → query fails | market chart empty state, market tile 0 |
| join requests, members | already allowed | real data |

So either (a) run the pass as is and treat the charts' **empty states** and
**axes** as what's under test, with a `permission-denied` / `requires an
index` error in the console for each of the three listeners — expected, not
a bug; or (b) deploy the rules and the index first (rules are backward
compatible with installed builds; see `c987f39`) and see real data. Choosing
is yours; (b) is a production deploy.

## Setup

- [ ] Signed in as the owner of a community that has at least one pending
      join request and 2+ members. Note its chatId: `______`.
- [ ] A second community the same account belongs to but does NOT own: `______`.
- [ ] Console open, filtered on `community-admin`.

## 1. Owner sees the dashboard

- [ ] Community page → owner sees **Manage** and **Dashboard** side by side.
- [ ] Dashboard opens at `/(client)/chat/community-admin?chatId=…`.
- [ ] Order top to bottom: sticky header → title block → join requests →
      4 tiles → charts → members.
- [ ] Header stays pinned on scroll, translucent with blur behind it.
- [ ] Requests card has the amber ring; count badge matches the rows.
- [ ] Requests tile has the amber ring while count > 0.
- [ ] Numbers count up on first paint; digits don't jitter width (tabular).
- [ ] Console: no errors other than the expected ones in the table above.

## 2. Non-owner is redirected

- [ ] Open `/(client)/chat/community-admin?chatId=<not-owned>` directly →
      lands on that community's details page, no dashboard flash.
- [ ] Console: no `joinRequests` / `communityEvents` / `memberStats`
      permission errors from that visit (no owner listener started).

## 3. 7 / 30 / 90 redraws both charts

For each of 7, 30, 90:
- [ ] Selected pill moves (surface + soft shadow).
- [ ] Flow chart subtitle reads the range; lines draw in again (or the empty
      state shows, with ~5 date labels that change with the range).
- [ ] Market chart: 4 bars for 7 and 30, 13 for 90; bars grow in again with
      the stagger; labels W4…W1 (W1 = this week, rightmost).
- [ ] Tiles: net growth and market values change with the range; the
      members/requests tiles don't.

## 4. Crosshair and bar tooltips with a mouse

(Needs data — skip the flow part if the flow chart shows its empty state.)
- [ ] Moving over the flow plot: 1px vertical line snaps to the nearest day,
      ringed dot on both lines, card beside the line (not under the cursor)
      with the date, Joined N, Left N.
- [ ] Near the right edge the card flips to the left of the line.
- [ ] Leaving the plot hides crosshair and card.
- [ ] Market: hovering anywhere in a bar's column (not just the bar) raises
      that bar to full opacity and shows "Week N · N notices".
- [ ] Empty charts: no crosshair, no tooltip, the written note is centred.

## 5. he ↔ en flips rows, not charts

In each language:
- [ ] Header, title block, card heads, tile foot rows, request and member
      rows are mirrored in Hebrew (avatar on the right, buttons on the left).
- [ ] Legends mirror; the charts do NOT: time runs left→right, y-axis
      numbers on the LEFT, right-aligned against the plot, in both languages.
- [ ] Hebrew dates read `25.9`; English `25 Sept`.
- [ ] All text is Heebo in both languages (inspect a Latin label's font).
- [ ] Tile order mirrors in Hebrew (Members tile rightmost on a wide screen).

## 6. Requests go to two columns above 900px

- [ ] ≥ 900px wide: requests in two columns; long names ellipsize; Approve
      and Reject never clipped — try a narrow 900–950px window.
- [ ] < 900px: one column; tiles 2×2; charts stacked.
- [ ] < 420px: tiles in one column; member rows still show the Remove button
      (check whether the name still has room when Remove is armed — the
      armed row adds a Cancel button).

## 7. Safe interactions

- [ ] Search: a name fragment, then a role (in either language) filters;
      nonsense shows "לא נמצאו חברים בחיפוש הזה." / "No members match that search."
- [ ] Remove, first tap only: label becomes "Yes, remove" + Cancel appears;
      wait 4s → it resets by itself. Tap again, then Cancel → resets. Stop there.
- [ ] Owner's own row: Owner chip, no Remove.
- [ ] Dark mode (OS setting): whole dashboard switches palette; rest of the
      app stays light.

## Found

| # | Step | What | Severity |
|---|---|---|---|
| | | | |
