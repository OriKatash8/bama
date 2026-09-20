# Meeting & task detail popups: Step 1 findings

## 1. Where they live
- **Both are inline** in `src/app/(client)/(tabs)/chats/project-details.tsx` (~3,300 lines). Two `<Modal>` blocks near the end, not components, and not shared with any other screen.
- **They are siblings already:** both reuse `styles.centerOverlay` / `styles.centerCard`, the `modalTitle`, `detailLabel`, `detailValue`, `descPanel`, `modalBtn` + `modalBtnCancel` styles, and `styles.missionTrashBtn`.
- **The screen serves both modes.** The route lives under `(client)`, but the chat room links professionals to the same path, so anything here shows in both apps. The accent already follows the mode via `useModeAccent()`.
- **Tests that render this screen:** `projectDetailsAddMeeting`, `projectDetailsFeeScoping`, `projectDetailsClose` (the last one drives both popups by `testID`: `mission-close`, `meeting-close`).

## 2. The task ("mission") popup, in order
| Order | Field / control | Notes |
|---|---|---|
| 1 | **Title** | `detailMission.title`, no line limit today |
| 2 | **Status pill** | To Do / In Progress / Done. **Display-only here** — cycling happens on the card, not in the popup |
| 3 | **Trash** | Only when status is Done. Asks to confirm, then deletes and closes |
| 4 | **Description** | Only when present; label + panel |
| 5 | **Assign to** | Names comma-joined, `—` when empty |
| 6 | **Due date** | Only when present; `dd/mm/yy` |
| 7 | **סגירה (Close)** | Dismiss only |

**Differences from the meeting popup**
- Has a **status**; the meeting has none.
- **Assignees** vs **invitees** (same shape: ids → names).
- **Due date** (one date) vs **date + time + location** (the meeting also has a location field).
- The meeting's trash appears when the meeting is **past**, the mission's when it is **done**.
- Otherwise identical: same title row, description block, comma-joined people, and Close button.

**Actions, for your Step 2 layout question:** neither popup has a real action. The only action is the conditional trash, and it is destructive, not primary. So there is nothing to make primary next to סגירה unless you want the mission's status to become cyclable here too (it is not today).

**Mission status states:** `todo`, `in_progress`, `done`. Today: black outline for to-do, mode accent for in-progress, green wash + "✓" for done, black label throughout.

## 3. Colours
- **Hardcoded in the file** for everything the popups draw: `#000000` text, `#F3EEFE` tints, the red trash `#e04b4b`, mode accent from `useModeAccent()`.
- **`useTheme` appears twice in these popups:** `colors.card` (the card's background) and `colors.border` (the Close button's border). Step 2 replaces both with the literals in your spec (`#FFFFFF`, `#DDD7EC`), so **`useTheme` does not need to change. No stop.**
- Nothing here comes from `surface.ts`.

## 4. The weekday — NOT available
- `formatDueDate(iso, prefix)` (this file) returns `dd/mm/yy` only.
- `getMeetingDateParts(dateStr)` (this file) returns `{ monthAbbr, day }` for the card's date block.
- `formatMeetingDateTime` returns `"Sep 5 · 10:00"` (en-US, month + day).
- The only weekday anywhere is inside `ChatsScreen`'s own timestamp helper (`weekday: 'short'`), local to that file and not exported.
- **So there is no weekday to reuse.** Producing "יום ראשון" means calling `toLocaleDateString(locale, { weekday: 'long' })` — a new formatter, which your brief says not to build without telling you. Your call: add one, or use `"<date> · <time>"`.

## 5. Invitees — no cap
- `invitedIds: string[]`, no maximum in the picker, the service or the rules.
- The picker offers every project member: the client plus each professional in a filled slot. So the realistic maximum is the project's member count (small, but unbounded in principle).
- The **cards** cap avatars at `MAX_STACK = 3` with a "+N" overflow; the **popup** lists everyone, so chips must wrap.
- Chips can show photos: `memberUsers: Record<string, { displayName, photoURL }>` and `clientUser` are both in state. `allMemberNames` is names-only, so chips would read from `memberUsers` / `clientUser` instead.

## 6. Presentation today, and what exists to reuse
- **Both are `<Modal transparent animationType="fade">` with a centred card** (`centerOverlay` + `centerCard`: 440 max width, 85% max height, radius 24). That is what I changed them to earlier today at your request; before that they were bottom sheets (`modalOverlay` + `modalSheet`, radius 20, `animationType="slide"`). Step 2 moves them back to a bottom sheet, with the spec's dimensions.
- **There is no reusable bottom-sheet component.** `src/components/ui/Modal.tsx` exists but is a centred card and is imported nowhere. Every sheet in the app is hand-rolled: this screen's own `modalSheet`, `DirectProjectSheet`, `ModeSwitcherSheet`, the marketplace filter card.
- `src/components/ui/Avatar.tsx` (`uri`, `name`, `size`) **is** reusable for the chip avatars.

## Decisions I need before Step 2
1. **Sheet component.** There is none to reuse. Either I build the sheet inline in this file (matching the spec, two copies sharing local styles), or I extract a small `BottomSheet` in `components/ui` and use it for both. I'd extract it, since the two popups are siblings and the spec wants them identical.
2. **Grabber and drag.** Today: tap the scrim to dismiss; **no drag-to-dismiss** anywhere in the app. So the grabber would be decorative unless I add a pan gesture. Say which: decorative grabber, or wire drag-to-dismiss.
3. **The kicker ("פגישה" / the task equivalent) — no such string exists.** Only plurals (`meetings`: "Meetings", `missions`: "Missions") and the add-titles (`add_meeting_title`: "Add Meeting"). Per your brief I will not write new copy, so either you give me the two strings, or I drop the kicker.
4. **The task popup's icon — it has none.** No icon appears on the mission card or in its popup. The app associates a mission with `CheckSquare` (the chat's attachment menu and its system notice). Confirm `CheckSquare`, or name another.
5. **Weekday:** add a formatter, or "<date> · <time>" (see 4 above).
6. **The mission status badge.** Your spec gives the badge geometry (10pt, 999 radius, 3/8 padding) but says you will assign colours. States are `todo`, `in_progress`, `done`. Today's treatment is listed in section 2.
7. **The trash.** It is the only action besides Close and it is conditional. Keep it as the small round red button in the header (today), or make it a full-width destructive button beside סגירה?
