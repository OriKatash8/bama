import type { Meeting } from '@core/types/project';

/** An older meeting carries no length; it is treated as an hour. */
export const DEFAULT_MEETING_MINUTES = 60;

export type CalendarEvent = {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string;
  notes: string;
  url?: string;
};

type MeetingLike = Pick<Meeting, 'title' | 'date' | 'time' | 'location' | 'description' | 'durationMinutes' | 'link'>;

/**
 * A meeting as a calendar event. The date and time are read as LOCAL time,
 * exactly as the rest of the app reads them (`new Date(`${date}T${time}`)`).
 * No time ⇒ an all-day event (the app treats such a meeting as lasting the day).
 */
export function meetingToEvent(m: MeetingLike): CalendarEvent {
  const [y, mo, d] = m.date.split('-').map(Number);
  const notes = [m.description?.trim(), m.link?.trim()].filter(Boolean).join('\n');
  const common = { title: m.title, location: m.location ?? '', notes, ...(m.link ? { url: m.link } : {}) };

  if (!m.time) {
    return { ...common, allDay: true, start: new Date(y, mo - 1, d), end: new Date(y, mo - 1, d + 1) };
  }
  const [h, min] = m.time.split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, min);
  const end = new Date(start.getTime() + (m.durationMinutes ?? DEFAULT_MEETING_MINUTES) * 60_000);
  return { ...common, allDay: false, start, end };
}

// ── .ics (RFC 5545), for web ─────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const utcStamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const localDate = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** TEXT escaping: backslash, semicolon, comma, newline. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines are at most 75 bytes; continuations start with a space. Never splits a character. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // a continuation's leading space counts
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(e: CalendarEvent, opts: { uid: string; now?: Date }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BAMA//Meetings//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${utcStamp(opts.now ?? new Date())}`,
    ...(e.allDay
      ? [`DTSTART;VALUE=DATE:${localDate(e.start)}`, `DTEND;VALUE=DATE:${localDate(e.end)}`]
      : [`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.end)}`]),
    `SUMMARY:${esc(e.title)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.notes ? [`DESCRIPTION:${esc(e.notes)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
