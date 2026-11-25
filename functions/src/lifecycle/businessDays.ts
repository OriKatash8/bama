import { HDate, HebrewCalendar, flags } from '@hebcal/core';
import { TIMEZONE } from '../pricing';

/**
 * Israeli business days, for the fee dispute window and the block grace.
 *
 * A BUSINESS DAY is Sunday–Thursday in Asia/Jerusalem that is not a chag (yom tov,
 * Israel schedule — `il: true`), not Yom HaAtzmaut, and not listed in
 * `config/pricing.extraNonBusinessDays`. Friday and Saturday never are. Chol
 * HaMoed, Purim, Hanukkah and the fasts are ordinary business days.
 *
 * No holiday list is hardcoded: the calendar comes from @hebcal/core.
 *
 * Everything works on CIVIL dates ('YYYY-MM-DD' in Israel time) and converts to an
 * instant only at the end, so a DST change can never shift a deadline by a day.
 */

/** 'YYYY-MM-DD', a calendar date in Israel. */
export type Ymd = string;

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function localParts(ms: number) {
  const o: Record<string, number> = {};
  for (const p of PARTS.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return o;
}

/** Offset of Israel time from UTC at instant `ms`, in ms (+2h or +3h). */
function offsetAt(ms: number): number {
  const p = localParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The calendar date, in Israel, of instant `ms`. */
export function ymdOf(ms: number): Ymd {
  const p = localParts(ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function parseYmd(ymd: Ymd): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

/** The instant at which Israeli wall-clock reads `ymd hh:mm:ss`. */
export function instantAt(ymd: Ymd, hh = 0, mm = 0, ss = 0): number {
  const { y, m, d } = parseYmd(ymd);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  // Two passes: the offset must be read at the answer, not at the guess, or a
  // wall time near a DST change lands an hour off.
  return guess - offsetAt(guess - offsetAt(guess));
}

/** 23:59:59 Israel time on `ymd` — the end of that day, as every deadline is. */
export function endOfDay(ymd: Ymd): number {
  return instantAt(ymd, 23, 59, 59);
}

export function addDays(ymd: Ymd, n: number): Ymd {
  const { y, m, d } = parseYmd(ymd);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: Ymd): number {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const holidayCache = new Map<Ymd, boolean>();

/** A chag (yom tov, Israel schedule) or Yom HaAtzmaut. From @hebcal/core. */
export function isIsraeliHoliday(ymd: Ymd): boolean {
  const hit = holidayCache.get(ymd);
  if (hit !== undefined) return hit;
  const { y, m, d } = parseYmd(ymd);
  // A local-time Date built from the civil parts: HDate reads them back in local
  // time, so the host's own zone cancels out.
  const events = HebrewCalendar.getHolidaysOnDate(new HDate(new Date(y, m - 1, d)), true) ?? [];
  const yes = events.some((e) => {
    const f = e.getFlags();
    return (f & flags.CHAG) !== 0
      || ((f & flags.MODERN_HOLIDAY) !== 0 && e.getDesc() === "Yom HaAtzma'ut");
  });
  holidayCache.set(ymd, yes);
  return yes;
}

export type DayRules = { extraNonBusinessDays?: readonly string[] };

function isExtra(ymd: Ymd, rules: DayRules): boolean {
  return !!rules.extraNonBusinessDays?.includes(ymd);
}

/** Sunday–Thursday, not a chag, not Yom HaAtzmaut, not in the extra list. */
export function isBusinessDay(ymd: Ymd, rules: DayRules = {}): boolean {
  const wd = weekdayOf(ymd);
  if (wd === 5 || wd === 6) return false;
  return !isIsraeliHoliday(ymd) && !isExtra(ymd, rules);
}

/**
 * A day a NOTICE may go out: anything but Saturday, a chag or Yom HaAtzmaut, or an
 * extra non-business day. Friday is allowed, which is the only difference from a
 * business day.
 */
export function isNoticeDay(ymd: Ymd, rules: DayRules = {}): boolean {
  return weekdayOf(ymd) !== 6 && !isIsraeliHoliday(ymd) && !isExtra(ymd, rules);
}

/**
 * The Nth business day after the day of `fromMs` — the completion day itself never
 * counts, even when it is a business day. Returns that day.
 */
export function addBusinessDaysYmd(fromMs: number, n: number, rules: DayRules = {}): Ymd {
  let day = ymdOf(fromMs);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    day = addDays(day, 1);
    if (isBusinessDay(day, rules)) left -= 1;
  }
  return day;
}

/** 23:59:59 Israel time at the end of the Nth business day after `fromMs`. */
export function addBusinessDays(fromMs: number, n: number, rules: DayRules = {}): number {
  return endOfDay(addBusinessDaysYmd(fromMs, n, rules));
}

/** The business day before `ymd` (which need not be one itself). */
export function previousBusinessDay(ymd: Ymd, rules: DayRules = {}): Ymd {
  let day = addDays(ymd, -1);
  while (!isBusinessDay(day, rules)) day = addDays(day, -1);
  return day;
}

/** The first notice day on or after `ymd`. */
export function nextNoticeDay(ymd: Ymd, rules: DayRules = {}): Ymd {
  let day = ymd;
  while (!isNoticeDay(day, rules)) day = addDays(day, 1);
  return day;
}

/**
 * The first moment at or after `afterMs` at which a notice may go out: `hour`:00
 * Israel time on a notice day.
 */
export function firstNoticeAtOrAfter(afterMs: number, hour: number, rules: DayRules = {}): number {
  let day = ymdOf(afterMs);
  for (;;) {
    day = nextNoticeDay(day, rules);
    const at = instantAt(day, hour);
    if (at >= afterMs) return at;
    day = addDays(day, 1);
  }
}

const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** "סוף יום רביעי 26.11" — the end of the day `ms` falls on, in Israel. */
export function formatEndOfDayHe(ms: number): string {
  const ymd = ymdOf(ms);
  const { m, d } = parseYmd(ymd);
  return `סוף יום ${HE_WEEKDAYS[weekdayOf(ymd)]} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

/** Both ends of the fee timeline for an engagement completed at `completedAtMs`. */
export function feeTimeline(
  config: {
    disputeWindowBusinessDays: number; blockGraceBusinessDays: number;
    extraNonBusinessDays: readonly string[];
  },
  completedAtMs: number,
): { windowEndsAt: number; blockAt: number } {
  const rules = { extraNonBusinessDays: config.extraNonBusinessDays };
  return {
    windowEndsAt: addBusinessDays(completedAtMs, config.disputeWindowBusinessDays, rules),
    blockAt: addBusinessDays(
      completedAtMs, config.disputeWindowBusinessDays + config.blockGraceBusinessDays, rules,
    ),
  };
}
