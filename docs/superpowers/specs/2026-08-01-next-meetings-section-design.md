# Next Meetings Section — Design Spec

## Context

The project details page (`src/app/(client)/(tabs)/chat/project-details.tsx`) already has a Missions section: a real-time list of tasks with assignees, due dates, and a cycling status. The Next Meetings section follows the exact same pattern — same UI structure, same Firestore subcollection approach, same service file shape.

---

## Data Model

Add `Meeting` to `src/core/types/project.ts`:

```ts
export type Meeting = {
  id: string;
  projectId: string;
  title: string;
  date: string;       // "YYYY-MM-DD"
  time: string;       // "HH:MM" 24h
  location: string;
  invitedIds: string[];
  createdBy: string;
  createdAt: Timestamp;
};
```

No `status` field. Urgency (colour, sort position) is derived at render time by comparing `date + time` to the current datetime. Nothing is stored about whether a meeting is "past".

---

## New Service — `meetingService.ts`

Create `src/features/chat/services/meetingService.ts`, mirroring `missionService.ts`:

```ts
listenToMeetings(projectId: string, callback: (meetings: Meeting[]) => void): Unsubscribe
// Firestore query: collection projects/{projectId}/meetings, orderBy('date','asc'), orderBy('time','asc')

addMeeting(
  projectId: string,
  createdBy: string,
  data: { title: string; date: string; time: string; location: string; invitedIds: string[] }
): Promise<void>
// addDoc to projects/{projectId}/meetings with createdAt: serverTimestamp()
```

No update or delete functions needed for the initial release.

---

## Urgency Logic

Computed per-render from each meeting's `date` + `time`:

```ts
function getMeetingUrgency(date: string, time: string): 'past' | 'imminent' | 'soon' | 'normal' {
  const meetingAt = new Date(`${date}T${time}`);
  const now = new Date();
  if (meetingAt <= now) return 'past';
  const diffDays = (meetingAt.getTime() - now.getTime()) / 86_400_000;
  if (diffDays <= 2) return 'imminent';
  if (diffDays <= 7) return 'soon';
  return 'normal';
}
```

Title text colours:
| Urgency | Colour |
|---------|--------|
| `past` | `#22c55e` (green) |
| `imminent` | `#ef4444` (red) |
| `soon` | `#f59e0b` (yellow) |
| `normal` | `colors.text` (theme default) |

---

## Client-Side Sort

Firestore returns meetings ordered by date + time ascending. Before rendering, split into two groups and concatenate:

```
upcoming = meetings where urgency !== 'past'   → already soonest-first from Firestore
past     = meetings where urgency === 'past'   → reversed to most-recent-first
display  = [...upcoming, ...past]
```

The Firestore query returns all meetings oldest-to-newest. After splitting, `past` is reversed in JavaScript so yesterday appears before last month.

---

## UI — Meeting Row

Same three-column structure as a mission row:

```
[ invitee avatar (+N badge) ] [ title card ] [ (no status card) ]
```

**Title card** (middle, `flex: 1`):
- Line 1: `title` — coloured by urgency
- Line 2: formatted date + time (e.g. "Aug 5 · 14:00")
- Line 3: `location`

**Avatar**: first `invitedId` from `memberUsers`, with `+N` overlay badge if `invitedIds.length > 1`. Fallback to initial letter if no photo. Same styles as mission avatar.

Rows are not tappable (no status to cycle). Tapping does nothing.

---

## UI — Section Header

```
[ "Meetings" / "פגישות" ]    [ "+ Add" button ]
```

Matches the Missions section header exactly. The `+ Add` button opens the add-meeting form (inline, same as `showAddMission`).

---

## UI — Add Meeting Form

Shown when `showAddMeeting === true`, collapsed otherwise. Fields in order:

1. **Title** — TextInput, required
2. **Date** — tappable field that opens `MiniCalendar` (same as mission due date)
3. **Time** — TextInput, placeholder `"HH:MM"`, keyboard type `numeric`
4. **Location** — TextInput
5. **Invitees** — member toggle list (same pattern as mission `assignedTo` — tap a name to add/remove from `newMeetingInvitedIds`)

Submit button: disabled until title + date + time + location are non-empty and at least one invitee is selected. Calls `addMeeting`, then resets all form state and collapses form.

---

## State Added to `project-details.tsx`

```ts
const [meetings, setMeetings] = useState<Meeting[]>([]);
const [showAddMeeting, setShowAddMeeting] = useState(false);
const [newMeetingTitle, setNewMeetingTitle] = useState('');
const [newMeetingDate, setNewMeetingDate] = useState('');
const [newMeetingTime, setNewMeetingTime] = useState('');
const [newMeetingLocation, setNewMeetingLocation] = useState('');
const [newMeetingInvitedIds, setNewMeetingInvitedIds] = useState<string[]>([]);
const [showMeetingDatePicker, setShowMeetingDatePicker] = useState(false);
const [isAddingMeeting, setIsAddingMeeting] = useState(false);
```

New `useEffect` (parallel to the missions one):
```ts
useEffect(() => {
  if (!projectId) return;
  return listenToMeetings(projectId, setMeetings);
}, [projectId]);
```

---

## i18n Keys Needed

Add to both `en.json` and `he.json` under `project_details`:

| Key | EN | HE |
|-----|----|----|
| `meetings` | "Meetings" | "פגישות" |
| `no_meetings` | "No meetings scheduled" | "אין פגישות מתוכננות" |
| `add_meeting` | "Add meeting" | "הוסף פגישה" |
| `meeting_title` | "Title" | "כותרת" |
| `meeting_date` | "Date" | "תאריך" |
| `meeting_time` | "Time (HH:MM)" | "שעה (HH:MM)" |
| `meeting_location` | "Location" | "מיקום" |
| `meeting_invitees` | "Invitees" | "מוזמנים" |
| `error_add_meeting` | "Failed to add meeting" | "שגיאה בהוספת פגישה" |

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/types/project.ts` | Add `Meeting` type |
| `src/features/chat/services/meetingService.ts` | New file — `listenToMeetings`, `addMeeting` |
| `src/app/(client)/(tabs)/chat/project-details.tsx` | Add section, state, useEffect, handlers, row render, add-form |
| `src/core/i18n/translations/en.json` | Add `project_details.meetings.*` keys |
| `src/core/i18n/translations/he.json` | Add `project_details.meetings.*` keys |
