import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { Meeting } from '@core/types/project';
import { meetingToEvent, buildIcs } from './meetingCalendar';

/**
 * "Add to calendar" for a project meeting.
 *
 * iOS / Android: the phone's own pre-filled "new event" sheet, via
 * expo-calendar's createEventInCalendarAsync. The person confirms (and picks the
 * calendar) in the system UI, so the app never lists or writes calendars itself
 * — and per the Expo docs, the system-provided UI needs no permission. It comes
 * from `expo-calendar/legacy`: the newer `calendar.addEventWithForm()` requires
 * at least write-only calendar permission on iOS 17+. Kept in this one file so
 * switching later is one change.
 *
 * Web: expo-calendar has no web support, so an .ics file is downloaded instead.
 */

/** False on an app build that predates the native calendar module — hide the button. */
export function canAddToCalendar(): boolean {
  if (Platform.OS === 'web') return true;
  return requireOptionalNativeModule('ExpoCalendar') !== null;
}

export async function addMeetingToCalendar(meeting: Meeting): Promise<void> {
  const e = meetingToEvent(meeting);

  if (Platform.OS === 'web') {
    const ics = buildIcs(e, { uid: `${meeting.id}@bama` });
    downloadFile('meeting.ics', new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    return;
  }

  // Lazy: an older build without the native module never loads it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createEventInCalendarAsync } = require('expo-calendar/legacy') as typeof import('expo-calendar/legacy');
  await createEventInCalendarAsync({
    title: e.title,
    startDate: e.start,
    endDate: e.end,
    allDay: e.allDay,
    location: e.location,
    notes: e.notes,
    ...(e.url ? { url: e.url } : {}),
  });
}

/** Web only: save a Blob through a temporary download link. */
function downloadFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
