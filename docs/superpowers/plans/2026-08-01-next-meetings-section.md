# Next Meetings Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Meetings section to the project details page that lists upcoming and past meetings with urgency-based colour coding.

**Architecture:** A new Firestore subcollection `projects/{projectId}/meetings` stores meeting documents. A `meetingService.ts` (mirroring the existing `missionService.ts`) provides a real-time listener and an add function. The `project-details.tsx` page renders the section between the Missions section and payment requests, reusing all existing mission row/modal styles. Urgency (colour, sort order) is computed at render time from `date + time` vs. `now` — no status field in Firestore.

**Tech Stack:** React Native, Expo Router, Firebase Firestore, TypeScript (strict), existing `missionService.ts` / `MiniCalendar` patterns.

## Global Constraints

- Full TypeScript — no `any`
- RTL support: all rows use `flexDirection: rowDirection`, text uses `textAlign: rtl ? 'right' : 'left'`
- Reuse existing styles from `project-details.tsx` (`missionRow`, `missionTitleCard`, `missionAvatar*`, `modalOverlay`, `modalSheet`, etc.) — add no new styles unless unavoidable
- i18n: all user-visible strings via `t('project_details.*')` keys
- `assignableMembers` array (already computed in the component) is the source of truth for invitee options
- `allMemberNames` record (already computed) is the source of truth for display names

---

### Task 1: Data layer — `Meeting` type + `meetingService.ts`

**Files:**
- Modify: `src/core/types/project.ts` (append after `Mission` type, ~line 145)
- Create: `src/features/chat/services/meetingService.ts`

**Interfaces:**
- Produces:
  ```ts
  // types/project.ts
  export type Meeting = {
    id: string;
    projectId: string;
    title: string;
    date: string;       // "YYYY-MM-DD"
    time: string;       // "HH:MM"
    location: string;
    invitedIds: string[];
    createdBy: string;
    createdAt: Timestamp;
  };
  ```
  ```ts
  // meetingService.ts
  listenToMeetings(projectId: string, callback: (meetings: Meeting[]) => void): Unsubscribe
  addMeeting(projectId: string, createdBy: string, data: { title: string; date: string; time: string; location: string; invitedIds: string[] }): Promise<void>
  ```

- [ ] **Step 1: Add `Meeting` type to `src/core/types/project.ts`**

  After the `Mission` type block (~line 145), add:

  ```ts
  export type Meeting = {
    id: string;
    projectId: string;
    title: string;
    date: string;
    time: string;
    location: string;
    invitedIds: string[];
    createdBy: string;
    createdAt: Timestamp;
  };
  ```

- [ ] **Step 2: Create `src/features/chat/services/meetingService.ts`**

  ```ts
  import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    type Unsubscribe,
    type QueryDocumentSnapshot,
    type DocumentData,
  } from 'firebase/firestore';
  import { db } from '../../../core/firebase/config';
  import type { Meeting } from '../../../core/types/project';

  function docToMeeting(d: QueryDocumentSnapshot<DocumentData>): Meeting {
    const data = d.data();
    return {
      id: d.id,
      projectId: data.projectId as string,
      title: data.title as string,
      date: data.date as string,
      time: data.time as string,
      location: data.location as string,
      invitedIds: (data.invitedIds ?? []) as string[],
      createdBy: data.createdBy as string,
      createdAt: data.createdAt,
    };
  }

  export function listenToMeetings(
    projectId: string,
    callback: (meetings: Meeting[]) => void,
  ): Unsubscribe {
    const q = query(
      collection(db, 'projects', projectId, 'meetings'),
      orderBy('date', 'asc'),
      orderBy('time', 'asc'),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(docToMeeting));
    });
  }

  export async function addMeeting(
    projectId: string,
    createdBy: string,
    data: { title: string; date: string; time: string; location: string; invitedIds: string[] },
  ): Promise<void> {
    await addDoc(collection(db, 'projects', projectId, 'meetings'), {
      ...data,
      projectId,
      createdBy,
      createdAt: serverTimestamp(),
    });
  }
  ```

- [ ] **Step 3: Run TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no new errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/core/types/project.ts src/features/chat/services/meetingService.ts
  git commit -m "feat: add Meeting type and meetingService"
  ```

---

### Task 2: i18n keys

**Files:**
- Modify: `src/core/i18n/translations/en.json`
- Modify: `src/core/i18n/translations/he.json`

**Interfaces:**
- Produces: `t('project_details.meetings')`, `t('project_details.no_meetings')`, `t('project_details.add_meeting_title')`, `t('project_details.meeting_title_label')`, `t('project_details.meeting_title_placeholder')`, `t('project_details.meeting_date')`, `t('project_details.meeting_time')`, `t('project_details.meeting_time_placeholder')`, `t('project_details.meeting_location')`, `t('project_details.meeting_location_placeholder')`, `t('project_details.meeting_invitees')`, `t('project_details.error_add_meeting')`

- [ ] **Step 1: Add keys to `en.json`**

  Inside the `"project_details"` object (after the last existing key, before the closing `}`), add:

  ```json
  "meetings": "Meetings",
  "no_meetings": "No meetings scheduled",
  "add_meeting_title": "Add Meeting",
  "meeting_title_label": "Title",
  "meeting_title_placeholder": "e.g. Production review",
  "meeting_date": "Date",
  "meeting_time": "Time",
  "meeting_time_placeholder": "HH:MM",
  "meeting_location": "Location",
  "meeting_location_placeholder": "e.g. Studio / Zoom link",
  "meeting_invitees": "Invitees",
  "error_add_meeting": "Could not add meeting. Please try again."
  ```

- [ ] **Step 2: Add keys to `he.json`**

  Inside the `"project_details"` object, add:

  ```json
  "meetings": "פגישות",
  "no_meetings": "אין פגישות מתוכננות",
  "add_meeting_title": "הוסף פגישה",
  "meeting_title_label": "כותרת",
  "meeting_title_placeholder": "לדוגמה: סקירת הפקה",
  "meeting_date": "תאריך",
  "meeting_time": "שעה",
  "meeting_time_placeholder": "HH:MM",
  "meeting_location": "מיקום",
  "meeting_location_placeholder": "לדוגמה: סטודיו / קישור זום",
  "meeting_invitees": "מוזמנים",
  "error_add_meeting": "לא ניתן להוסיף פגישה. נסה שוב."
  ```

- [ ] **Step 3: Verify TypeScript still clean**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/core/i18n/translations/en.json src/core/i18n/translations/he.json
  git commit -m "feat: add i18n keys for meetings section"
  ```

---

### Task 3: Wire up meetings in `project-details.tsx`

**Files:**
- Modify: `src/app/(client)/(tabs)/chat/project-details.tsx`

**Interfaces:**
- Consumes: `Meeting` from `@core/types/project`, `listenToMeetings`, `addMeeting` from `@features/chat/services/meetingService`
- Produces: meetings list rendered in the page, add-meeting modal working end-to-end

- [ ] **Step 1: Add imports**

  At the top of `project-details.tsx`, add to the existing type import:
  ```ts
  import type { BundleOffer, CrewRequestSlot, FilledSlot, Meeting, Mission, MissionStatus, PaymentRequest, PriceOffer, ProjectRequest, RemovalRequest } from '@core/types/project';
  ```

  Add a new service import alongside the mission service import:
  ```ts
  import {
    listenToMeetings,
    addMeeting,
  } from '@features/chat/services/meetingService';
  ```

- [ ] **Step 2: Add state variables**

  After the missions state block (~line 116), add:

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

- [ ] **Step 3: Add `listenToMeetings` useEffect**

  After the `listenToMissions` useEffect (~line 198), add:

  ```ts
  useEffect(() => {
    if (!projectId) return;
    return listenToMeetings(projectId, setMeetings);
  }, [projectId]);
  ```

- [ ] **Step 4: Add helper functions**

  After the `toggleAssignee` function (~line 415), add:

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

  function formatMeetingDateTime(date: string, time: string): string {
    const d = new Date(`${date}T${time}`);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
  }

  function toggleInvitee(id: string) {
    setNewMeetingInvitedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleAddMeeting() {
    if (
      !projectId ||
      !newMeetingTitle.trim() ||
      !newMeetingDate ||
      !newMeetingTime.trim() ||
      !newMeetingLocation.trim() ||
      newMeetingInvitedIds.length === 0
    ) return;
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    setIsAddingMeeting(true);
    try {
      await addMeeting(projectId, currentUserId, {
        title: newMeetingTitle.trim(),
        date: newMeetingDate,
        time: newMeetingTime.trim(),
        location: newMeetingLocation.trim(),
        invitedIds: newMeetingInvitedIds,
      });
      setNewMeetingTitle('');
      setNewMeetingDate('');
      setNewMeetingTime('');
      setNewMeetingLocation('');
      setNewMeetingInvitedIds([]);
      setShowAddMeeting(false);
    } catch {
      Alert.alert('Error', t('project_details.error_add_meeting'));
    } finally {
      setIsAddingMeeting(false);
    }
  }
  ```

- [ ] **Step 5: Add sorted meetings derived value**

  Right before the `return (` statement (~line 550), add:

  ```ts
  const sortedMeetings = [
    ...meetings.filter((m) => getMeetingUrgency(m.date, m.time) !== 'past'),
    ...[...meetings.filter((m) => getMeetingUrgency(m.date, m.time) === 'past')].reverse(),
  ];
  ```

- [ ] **Step 6: Add Meetings section to the ScrollView**

  After the closing `)}` of the Missions section (after line ~756, the `</>`  or `)}` that ends the missions map), before the payment requests block, insert:

  ```tsx
  {/* SECTION 4 — Meetings */}
  <View style={[styles.sectionHeaderRow, { flexDirection: rowDirection }]}>
    <Text style={[styles.sectionTitle, { fontFamily: font.bold }]}>
      {t('project_details.meetings')}
    </Text>
    <TouchableOpacity onPress={() => setShowAddMeeting(true)} activeOpacity={0.8}>
      <Text style={[styles.addButtonText, { fontFamily: font.semiBold }]}>{t('project_details.add')}</Text>
    </TouchableOpacity>
  </View>

  {meetings.length === 0 ? (
    <Text style={[styles.emptyNote, { fontFamily: font.regular }]}>
      {t('project_details.no_meetings')}
    </Text>
  ) : (
    sortedMeetings.map((meeting) => {
      const urgency = getMeetingUrgency(meeting.date, meeting.time);
      const titleColor =
        urgency === 'past'     ? '#22c55e' :
        urgency === 'imminent' ? '#ef4444' :
        urgency === 'soon'     ? '#f59e0b' :
        colors.text;
      const firstInviteeId = meeting.invitedIds[0];
      const firstInviteeName = firstInviteeId ? (allMemberNames[firstInviteeId] ?? firstInviteeId) : '';
      const extraCount = meeting.invitedIds.length - 1;
      const firstMemberInfo = firstInviteeId ? memberUsers[firstInviteeId] : undefined;
      return (
        <View key={meeting.id} style={[styles.missionRow, { flexDirection: rowDirection }]}>
          <View style={styles.missionAvatarWrap}>
            {firstMemberInfo?.photoURL ? (
              <Image source={{ uri: firstMemberInfo.photoURL }} style={styles.missionAvatar} />
            ) : (
              <View style={[styles.missionAvatar, styles.missionAvatarFallback]}>
                <Text style={[styles.missionAvatarInitial, { fontFamily: font.bold }]}>
                  {firstInviteeName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            {extraCount > 0 && (
              <View style={styles.missionAvatarExtra}>
                <Text style={[styles.missionAvatarExtraText, { fontFamily: font.bold }]}>+{extraCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.missionTitleCard}>
            <Text style={[styles.missionTitle, { fontFamily: font.semiBold, color: titleColor }]} numberOfLines={2}>
              {meeting.title}
            </Text>
            <Text style={[styles.missionDue, { fontFamily: font.regular }]}>
              {formatMeetingDateTime(meeting.date, meeting.time)}
            </Text>
            <Text style={[styles.missionDue, { fontFamily: font.regular }]} numberOfLines={1}>
              {meeting.location}
            </Text>
          </View>
        </View>
      );
    })
  )}
  ```

- [ ] **Step 7: Add Add Meeting Modal**

  After the closing `</Modal>` of the Add Mission modal (~line 958), before the `showDueDatePicker` block, add:

  ```tsx
  {/* Add Meeting Modal */}
  <Modal
    visible={showAddMeeting}
    transparent
    animationType="slide"
    onRequestClose={() => setShowAddMeeting(false)}
  >
    <View style={styles.modalOverlay}>
      <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
        <Text style={[styles.modalTitle, { color: '#004aad', textAlign: rtl ? 'right' : 'left', fontFamily: font.bold }]}>
          {t('project_details.add_meeting_title')}
        </Text>

        <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', fontFamily: font.semiBold }]}>
          {t('project_details.meeting_title_label')}
        </Text>
        <TextInput
          style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}
          value={newMeetingTitle}
          onChangeText={setNewMeetingTitle}
          placeholder={t('project_details.meeting_title_placeholder')}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', fontFamily: font.semiBold }]}>
          {t('project_details.meeting_date')}
        </Text>
        {newMeetingDate ? (
          <View style={[styles.missionDateRow, { borderColor: '#004aad', backgroundColor: '#004aad18' }]}>
            <Calendar size={15} color="#004aad" strokeWidth={2} />
            <Text style={[styles.missionDateText, { color: '#004aad', textAlign: rtl ? 'right' : 'left', fontFamily: font.medium }]}>
              {formatDueDate(newMeetingDate, '')}
            </Text>
            <TouchableOpacity onPress={() => setNewMeetingDate('')} hitSlop={10} activeOpacity={0.7}>
              <Text style={[styles.missionDateClear, { fontFamily: font.bold }]}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.missionDateRow, { borderColor: colors.border }]}
            onPress={() => setShowMeetingDatePicker(true)}
            activeOpacity={0.8}
          >
            <Calendar size={15} color={colors.textMuted} strokeWidth={2} />
            <Text style={[styles.missionDatePlaceholder, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}>
              {t('project_details.meeting_date')}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', fontFamily: font.semiBold }]}>
          {t('project_details.meeting_time')}
        </Text>
        <TextInput
          style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}
          value={newMeetingTime}
          onChangeText={setNewMeetingTime}
          placeholder={t('project_details.meeting_time_placeholder')}
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
        />

        <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', fontFamily: font.semiBold }]}>
          {t('project_details.meeting_location')}
        </Text>
        <TextInput
          style={[styles.missionInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: '#004aad', textAlign: rtl ? 'right' : 'left', fontFamily: font.regular }]}
          value={newMeetingLocation}
          onChangeText={setNewMeetingLocation}
          placeholder={t('project_details.meeting_location_placeholder')}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={[styles.missionInputLabel, { color: '#004aad99', textAlign: rtl ? 'right' : 'left', fontFamily: font.semiBold }]}>
          {t('project_details.meeting_invitees')}
        </Text>
        {assignableMembers.map((m) => {
          const selected = newMeetingInvitedIds.includes(m.id);
          return (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.missionAssignRow,
                { borderColor: selected ? '#004aad' : colors.border },
                selected && styles.missionAssignRowSelected,
              ]}
              onPress={() => toggleInvitee(m.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.missionAssignName, { color: '#004aad', textAlign: rtl ? 'right' : 'left', fontFamily: font.medium }]}>
                {m.displayName}
              </Text>
              <View style={[styles.missionCheckbox, { borderColor: selected ? '#004aad' : colors.border, backgroundColor: selected ? '#004aad' : 'transparent' }]}>
                {selected && <Text style={[styles.missionCheckboxTick, { fontFamily: font.bold }]}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.modalActions}>
          <TouchableOpacity
            style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
            onPress={() => setShowAddMeeting(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.modalBtnCancelText, { color: '#004aad', fontFamily: font.semiBold }]}>{t('project_details.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modalBtn,
              styles.modalBtnConfirm,
              (!newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0 || isAddingMeeting) && styles.completeBtnDisabled,
            ]}
            onPress={handleAddMeeting}
            disabled={!newMeetingTitle.trim() || !newMeetingDate || !newMeetingTime.trim() || !newMeetingLocation.trim() || newMeetingInvitedIds.length === 0 || isAddingMeeting}
            activeOpacity={0.8}
          >
            {isAddingMeeting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={[styles.modalBtnConfirmText, { fontFamily: font.bold }]}>{t('project_details.add')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
  ```

- [ ] **Step 8: Add meeting date picker**

  After the `showDueDatePicker` MiniCalendar block (~line 966), add:

  ```tsx
  {showMeetingDatePicker && (
    <MiniCalendar
      value={newMeetingDate}
      onSelect={(iso) => { setNewMeetingDate(iso); setShowMeetingDatePicker(false); }}
      onClose={() => setShowMeetingDatePicker(false)}
    />
  )}
  ```

- [ ] **Step 9: Run TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add src/app/(client)/(tabs)/chat/project-details.tsx
  git commit -m "feat: add meetings section to project details"
  ```
