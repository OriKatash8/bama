# Item 3: professional review card, client carousel, instruction lines — deployed and verified live

**Status:** merged to main (`1fe0a05`), pushed, **45 functions deployed**, verified from the
downloaded artefacts, and clicked through live on web against production, including a
sole-pro decline. Rules were not redeployed (unchanged since `0152f73`).
**iPhone pass not done. That one needs you** (see §5).

---

## 1. What shipped (step 3, the UI)

| Commit | Step | What |
|---|---|---|
| `c33cbc4` | 3.1 | `CandidateProCard` replaces `CandidateStatusChip` (details below). `ActionButton` extracted. Client-side mirror of the price policy, plus a parity test of 1000+ cases against the server policy. "✓ {name} אישר/ה" tag on the client card. Grey `left` pill with a person-minus icon for "עזב את הפרויקט" and "החליט/ה לא להמשיך בפרויקט". |
| `fefbf05` | 3.2 | Client carousel when 2+ pros are pending (details below). |
| `97307d8` | 3.3 | Instruction line on both cards, he + en. |
| `1fe0a05` | — | `--item3` render seed and the render-pass screenshots. |

**The pro card's states:**
- **Actionable:** instruction line, then רלוונטי / לא רלוונטי / שינוי מחיר.
- **After his רלוונטי:** amber chip plus the muted note "אישרת · שינויי מחיר מעכשיו רק בתגובה להצעה
  של הלקוח/ה".
- **Once the client confirms:** green chip.
- **Dialogs:** רלוונטי warns that he can't propose a new price afterwards; לא רלוונטי is a
  destructive confirm.
- **שינוי מחיר** is enabled only when the server would accept the request.

**Carousel behaviour:**
- One pro at a time, with chevrons inline in the identity row and one line of dots.
- In Hebrew, both the swipe direction and the chevron order are mirrored.
- Buttons act on the shown pro. When that pro resolves, the index clamps and advances.
- It's no taller than a single row (measured below).

**Gate at merge:** root 957/957 (includes the functions suites). Root and functions typecheck
clean. Mutation checks: 3.1 11/11, 3.2 9/9, 3.3 2/2, all caught.

## 2. Render pass (before deploy, production seed with guard)
Screenshots: `docs/status/screenshots/2026-09-17-item3-render/` (19 files, he + en).

**Hebrew carousel (RTL):**
- The prev chevron is on the **right** and points right, disabled on the first pro (`he-02`).
- The next chevron is on the left (`he-03`).
- Swiping **right** goes to the next pro (`he-04`); swiping **left** goes back (`he-05`).
- The current dot sits on the right.

**English:** mirrored (`en-01`…`en-03`).

**Resolve while shown:** B was confirmed via admin while on screen. The card advanced live to
C, now 2/2 (`en-04`).

**Heights:**

| Card | Height |
|---|---|
| Single pro, no status line | 152px |
| Carousel row B, minus its tag line | 152px |
| Carousel with a status line | 175px |

The dots row is 6px, paid for by trimming the row padding. **The carousel adds no height.**

**Also captured:**
- the pro card's actionable state (en/he) and both dialog texts;
- the price sheet;
- the green chip;
- the acknowledged note (he/en);
- the client-asked link with שינוי מחיר disabled;
- the grey left pills and the 🎬 crew pill.

The seed was cleaned: 131 deleted, zero residue.

## 3. Deploy
- **2026-09-17 17:51–17:53 UTC.** 45 functions from `1fe0a05`: the V1 set plus new
  `acknowledgeCandidacy` and `declineCandidacy`. The 5 held community-invite functions and
  allowlisted `resolveCommunityInvite` stay excluded.
- **Artefacts:**
  - All 45 uploaded source zips downloaded (29 gen2, 16 gen1 from the latest `version-N`), every
    one timestamped this deploy.
  - **45/45 `src/` trees identical to `1fe0a05:functions/src`.**
  - Every compiled `lib` has:
    - `acknowledgeCandidacy` in `lifecycle/candidates.js`
    - `bundlesSnap` (the bundle-release fix) in `removal.js`
    - `candidate_declined` in `derive.js`
- **Drift check:** rules ok, 15 indexes ok, only the 5 held invite functions undeployed.
- Recorded in `docs/production-deploys.md`.

## 4. Live click-through (web, production, `localhost:8197`)

**Setup:**
- **Origin:** a fresh browser origin; your 8081 server was not touched.
- **Seed:** `scripts/seed-candidate-review-web.mjs --live3` (new mode, same guard as `--live`):
  - throwaway client plus pros A, B and C;
  - M1: two seats, pending offers from A (Editor ₪1,500) and B (Sound ₪900);
  - M2: one seat, a pending offer from C (Stills ₪1,200);
  - every seat pre-filled plus `targetProfessionalId`, so **no real user was notified**.
- **All hiring was done in the app** (Offers tab → אישור). Nothing was pre-accepted.
- **Harness:** `confirmDialog` is `window.confirm` on web, which blocks automation. I stubbed it
  to return `true` and record the message. The app's code path is unchanged.
- **Switching accounts:** cleared the page's Firebase auth store and reopened the tab.

Screenshots: `docs/status/screenshots/2026-09-17-item3-live/`

### Flow 1 (M1): carousel, pro acknowledgement, one unprompted price, confirm on the shown pro

| Step | UI | Production state after |
|---|---|---|
| Client hires A, B and C | "ההצעה אושרה!" ×3 | all 3 offers `accepted` / `review: pending`; fees `hired`; both chats created |
| Client opens M1 (`01`) | carousel 1/2 on A; instruction line; chevrons and dots | — |
| Pro A's view (`02`) | instruction line; ₪1,500; רלוונטי / לא רלוונטי / שינוי מחיר | — |
| A → רלוונטי (`03`) | dialog: "הפרויקט מתאים לך?… אחרי האישור לא תוכל/י להציע מחיר חדש — רק להגיב להצעה של הלקוח/ה."; toast "אישרת את הפרויקט"; **buttons gone, amber "ממתין להחלטת הלקוח/ה" + the muted respond-only note** | A's offer `proAccepted: true`, **`review` still `pending`**; project still `open` |
| Pro B → שינוי מחיר → ₪1,100 + note (`04`, `05`) | toast "הבקשה נשלחה ללקוח/ה"; "ממתין לתשובת הלקוח/ה על שינוי המחיר"; שינוי מחיר disabled; 💰 pill | request B→client 900→1100 `pending`; **client got the `system` push** "💰 בעל/ת המקצוע ביקש/ה שינוי מחיר…" |
| Client opens M1 (`06`) | A shows **"✓ אבי עורך אישר/ה"** | — |
| Client → next chevron (the left one, in Hebrew) (`07`) | B, 2/2: "בני סאונד הציע/ה מחיר חדש — לצפייה ותשובה ‹"; רלוונטי and שינוי מחיר blocked | — |
| Client → prev → רלוונטי **on A** (`08`) | dialog "לאשר את אבי עורך?… ₪1,500"; toast "אבי עורך אושר/ה לפרויקט"; **card drops to single-row mode showing B** | A `review: confirmed`; B still `pending`; project `open` |
| Client → B's link → payments → אישור | — | request `accepted`; B's offer ₪1,100 |
| Client → רלוונטי on B (`09`) | dialog "…₪1,100"; **card gone**; pill "הצוות נסגר — אבי עורך, בני סאונד" | B `confirmed`; **project `in_progress`**; `🎬 הצוות נסגר: אבי עורך, בני סאונד` |

### Flow 2 (M2): sole-pro decline

| Step | UI | Production state after |
|---|---|---|
| Pro C's view (`10`) | the actionable card, no carousel | — |
| C → לא רלוונטי (`11`) | dialog "לעזוב את הפרויקט?… תוסר/י מהצ׳אט ומהפרויקט, והלקוח/ה יקבל/תקבל הודעה."; toast "עזבת את הפרויקט"; **C sent back to his chat list, project chat gone** | see below |
| Client opens M2 (`12`) | no card; grey pill with person-minus icon "חן צלמת החליט/ה לא להמשיך בפרויקט" | — |

**Production state after C's decline:**
- **Project `open`**, not completed.
- `professionalIds` and `slotHolders` are empty, and chat members are only the client.
- Fee: `withdrawn`, `releaseReason: candidate_declined`, `status: not_owed`, `feeDue: 0`.
- Offer `removed`.
- Chat notice "חן צלמת החליט/ה לא להמשיך בפרויקט".
- **The client got the `system` push** "חן צלמת החליט/ה לא להמשיך בפרויקט "…m2"".

**Seen during the pass. Not a regression:** the dev build's red overlay showed
`[chat] chat listener failed: permission-denied` on C's screen at the moment he left. This is
the intended handling:
- Once removed from `members` he can no longer read the chat.
- The error callback (`ChatRoomScreen.tsx:731–739`, from `9879c80`, 2026-09-04) logs it and
  sends him to the chat list, which is what happened.
- Only development builds show `console.error` as an overlay.

## 5. Not done: iPhone
I can't run the iPhone pass. To seed fresh data:

```
node scripts/seed-candidate-review-web.mjs --live3      # prints the throwaway logins + manifest path
node scripts/seed-candidate-review-web.mjs --cleanup <manifest>
```

**Worth checking on device:**
- swiping the carousel (the PanResponder against the chat list's vertical scroll);
- the RTL chevrons;
- the price sheet with the keyboard up;
- the native `Alert` versions of both pro dialogs;
- the decline push actually arriving on the client's phone.

## 6. Cleanup
**`--cleanup` deleted 33 items:**
- 2 chats, with 3 messages
- 2 projects, with 3 fee docs and 1 payment request
- 3 offers
- 8 notifications, all to the throwaway uids
- 4 `users` docs and 3 pro profile docs
- 4 Auth users: client `r6XCkva2YgaOiwpiESepKR2OtLO2`, A `gbUWPkzCICdUcydghfyOO4jy6yh1`,
  B `3oLXWx0uFebyYbUrMFqkDam3rKy1`, C `HpuHqZCIU4QRhB4HBIYLaxzpAYc2`

**Read-only sweep afterwards: 0 everywhere.** Checked: projects by title and by client, offers,
bundle offers, chats containing any uid, notifications, the fees collection group, users docs,
Auth users, and project and chat docs.

**Local state:**
- The 8197 dev server is stopped and its session signed out.
- **Your 8081 server is still running**, untouched.
- One empty new-tab page from the harness may be left in Chrome (outside the automation group),
  so I couldn't close it.

## 7. Still deferred
- **Node 20 runtime upgrade:** deadline 2026-10-30.
- **The 5 community-invite functions:** still waiting on the budget-alert confirmation.
- **10 orphan `users` docs from the 2026-09-08 probes:** delete only on your go.
