/**
 * Time windows for the usage stats.
 *
 * Google resets the Firestore free daily quota at midnight PACIFIC time, so "today" is the
 * Pacific day, and "month to date" starts on the 1st (Pacific) as billing months do. Pure
 * functions over Intl (no timezone library), DST-correct.
 */

export const QUOTA_TZ = 'America/Los_Angeles';
export const ISRAEL_TZ = 'Asia/Jerusalem';

type Parts = { y: number; mo: number; d: number; h: number; mi: number; s: number };

function partsIn(tz: string, utcMs: number): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(utcMs))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** local − UTC, in ms, at that instant. */
function offsetMs(tz: string, utcMs: number): number {
  const p = partsIn(tz, utcMs);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant at which the wall clock in `tz` reads y-mo-d 00:00 (mo is 1-based; d may overflow). */
function localMidnightUtc(tz: string, y: number, mo: number, d: number): number {
  const wall = Date.UTC(y, mo - 1, d);
  let t = wall - offsetMs(tz, wall);
  t = wall - offsetMs(tz, t); // re-check: the offset can differ across a DST change
  return t;
}

/** Start of the Pacific day containing `now`. */
export function startOfDay(now: Date, tz: string = QUOTA_TZ): Date {
  const p = partsIn(tz, now.getTime());
  return new Date(localMidnightUtc(tz, p.y, p.mo, p.d));
}

/** Start of the NEXT Pacific day, i.e. the moment the daily quota resets. */
export function nextDayStart(now: Date, tz: string = QUOTA_TZ): Date {
  const p = partsIn(tz, now.getTime());
  return new Date(localMidnightUtc(tz, p.y, p.mo, p.d + 1));
}

/** Start of the Pacific month containing `now`. */
export function startOfMonth(now: Date, tz: string = QUOTA_TZ): Date {
  const p = partsIn(tz, now.getTime());
  return new Date(localMidnightUtc(tz, p.y, p.mo, 1));
}

/**
 * When the daily quota next resets, as an Israel wall-clock hour. Computed from the actual
 * instant, so it is 10 or 9 (or 8…) depending on which side of each country's DST change
 * we are; the UI says "around HH:00 Israel time" without ever naming Pacific time.
 */
export function quotaReset(now: Date): { resetsAt: Date; israelHour: number; israelMinute: number } {
  const resetsAt = nextDayStart(now);
  const p = partsIn(ISRAEL_TZ, resetsAt.getTime());
  return { resetsAt, israelHour: p.h, israelMinute: p.mi };
}
