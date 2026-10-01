import { meetingToEvent, buildIcs, DEFAULT_MEETING_MINUTES } from '../meetingCalendar';

/**
 * A project meeting as a calendar event: for the phone's own "new event" sheet
 * (expo-calendar) and as an .ics file on web. Times are read as local time, the
 * same way the app reads a meeting's date + time everywhere else.
 */

const base = {
  id: 'm1', projectId: 'p1', title: 'סיור לוקיישן', date: '2026-10-05', time: '10:00',
  location: 'רחוב הרצל 1, תל אביב', invitedIds: ['u1'], createdBy: 'u1', createdAt: null as never,
};

it('starts at the meeting time and lasts its duration', () => {
  const e = meetingToEvent({ ...base, durationMinutes: 90 });
  expect(e.allDay).toBe(false);
  expect(e.start).toEqual(new Date(2026, 9, 5, 10, 0));
  expect(e.end).toEqual(new Date(2026, 9, 5, 11, 30));
});

it('an old meeting with no duration lasts an hour', () => {
  expect(DEFAULT_MEETING_MINUTES).toBe(60);
  const e = meetingToEvent(base);
  expect(e.end).toEqual(new Date(2026, 9, 5, 11, 0));
});

it('a meeting with no time is an all-day event', () => {
  const e = meetingToEvent({ ...base, time: '' });
  expect(e.allDay).toBe(true);
  expect(e.start).toEqual(new Date(2026, 9, 5));
  expect(e.end).toEqual(new Date(2026, 9, 6));
});

it('carries the location, and the description and link in the notes', () => {
  const e = meetingToEvent({ ...base, description: 'להביא מצלמה', link: 'https://zoom.us/j/123' });
  expect(e.location).toBe(base.location);
  expect(e.notes).toBe('להביא מצלמה\nhttps://zoom.us/j/123');
  expect(e.url).toBe('https://zoom.us/j/123');
});

describe('.ics', () => {
  const ics = (m: Partial<typeof base> & Record<string, unknown> = {}) =>
    buildIcs(meetingToEvent({ ...base, ...m }), { uid: 'm1@bama', now: new Date(Date.UTC(2026, 8, 30, 12)) });

  it('is a VCALENDAR with one VEVENT, CRLF line endings', () => {
    const s = ics();
    expect(s.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(s).toContain('\r\nBEGIN:VEVENT\r\n');
    expect(s.trimEnd().endsWith('END:VEVENT\r\nEND:VCALENDAR')).toBe(true);
    expect(s.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('writes a timed event in UTC', () => {
    const start = new Date(2026, 9, 5, 10, 0);
    const utc = start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    expect(ics()).toContain(`DTSTART:${utc}`);
    expect(ics()).toContain('UID:m1@bama');
    expect(ics()).toContain('DTSTAMP:20260930T120000Z');
  });

  it('writes an all-day event as dates', () => {
    const s = ics({ time: '' });
    expect(s).toContain('DTSTART;VALUE=DATE:20261005');
    expect(s).toContain('DTEND;VALUE=DATE:20261006');
  });

  it('escapes commas, semicolons, backslashes and newlines', () => {
    const s = ics({ title: 'a, b; c\\d', description: 'line1\nline2' } as never).replace(/\r\n /g, '');
    expect(s).toContain('SUMMARY:a\\, b\; c\\\\d');
    expect(s).toContain('DESCRIPTION:line1\\nline2');
  });

  it('folds lines longer than 75 bytes', () => {
    const s = ics({ description: 'א'.repeat(100) } as never);
    for (const line of s.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(s.replace(/\r\n /g, '')).toContain(`DESCRIPTION:${'א'.repeat(100)}`);
  });
});
