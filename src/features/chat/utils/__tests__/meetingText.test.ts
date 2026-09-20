import { formatMeetingDetail } from '../meetingText';

/** The chat's "new meeting" system line. The hour is optional on a meeting. */

it('formats title, date and hour', () => {
  expect(formatMeetingDetail('📅 פגישה חדשה: Kickoff · 2026-09-17 12:15')).toBe('Kickoff · 17 בספט׳, 12:15');
});

it('keeps the date when the meeting has no hour', () => {
  // The trigger writes "date time" with an empty time, leaving a trailing space.
  expect(formatMeetingDetail('📅 פגישה חדשה: Kickoff · 2026-09-17 ')).toBe('Kickoff · 17 בספט׳');
});

it('writes the date in English for an English reader, keeping the meeting title', () => {
  expect(formatMeetingDetail('📅 פגישה חדשה: Kickoff · 2026-09-17 12:15', 'en')).toBe('Kickoff · Sep 17, 12:15');
});
