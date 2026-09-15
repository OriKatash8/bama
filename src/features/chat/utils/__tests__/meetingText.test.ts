import { formatHebMeetingDetail } from '../meetingText';

/** The chat's "new meeting" system line. The hour is optional on a meeting. */

it('formats title, date and hour', () => {
  expect(formatHebMeetingDetail('📅 פגישה חדשה: Kickoff · 2026-09-17 12:15')).toBe('Kickoff · 17 בספט׳, 12:15');
});

it('keeps the date when the meeting has no hour', () => {
  // The trigger writes "date time" with an empty time, leaving a trailing space.
  expect(formatHebMeetingDetail('📅 פגישה חדשה: Kickoff · 2026-09-17 ')).toBe('Kickoff · 17 בספט׳');
});
