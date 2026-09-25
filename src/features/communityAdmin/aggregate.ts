/**
 * Pure aggregation for the community dashboard. Everything is bucketed by the
 * viewer's LOCAL day, oldest bucket first, with the last bucket being today.
 * `now` is always passed in so the maths is testable and every chart on the
 * screen agrees on the same instant.
 */

export type CommunityEvent = {
  id: string;
  type: 'join' | 'leave';
  userId: string;
  at: Date;
};

export type RangeDays = 7 | 30 | 90;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** N local midnights, oldest first, the last one being today's. */
export function dayStarts(days: number, now: Date): Date[] {
  const today = startOfDay(now);
  return Array.from(
    { length: days },
    (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i)),
  );
}

/** Index of `d`'s local day in a `days`-long window ending today, or -1 outside it. */
function dayIndex(d: Date, days: number, now: Date): number {
  if (d.getTime() > now.getTime()) return -1;
  const starts = dayStarts(days, now);
  const t = d.getTime();
  // Walk back from the end: calendar days, not 24h slices, so DST can't shift a
  // bucket. Anything before the first midnight falls through to -1.
  for (let i = starts.length - 1; i >= 0; i--) {
    if (t >= starts[i].getTime()) return i;
  }
  return -1;
}

export function flowSeries(events: CommunityEvent[], days: number, now: Date) {
  const joins = new Array<number>(days).fill(0);
  const exits = new Array<number>(days).fill(0);
  for (const e of events) {
    const i = dayIndex(e.at, days, now);
    if (i < 0) continue;
    if (e.type === 'join') joins[i]++;
    else exits[i]++;
  }
  return { days: dayStarts(days, now), joins, exits };
}

export function netGrowth(events: CommunityEvent[], days: number, now: Date): number {
  const { joins, exits } = flowSeries(events, days, now);
  return sum(joins) - sum(exits);
}

/**
 * Member count at the end of each day in the window, walked back from the
 * current count. Only as good as the event log: before the log existed the
 * line is flat at whatever the walk-back reaches.
 */
export function memberCountSeries(current: number, events: CommunityEvent[], days: number, now: Date): number[] {
  const { joins, exits } = flowSeries(events, days, now);
  const out = new Array<number>(days);
  let count = current;
  for (let i = days - 1; i >= 0; i--) {
    out[i] = count;
    count = count - joins[i] + exits[i];
  }
  return out;
}

export function dailyCounts(dates: Date[], days: number, now: Date): number[] {
  const out = new Array<number>(days).fill(0);
  for (const d of dates) {
    const i = dayIndex(d, days, now);
    if (i >= 0) out[i]++;
  }
  return out;
}

export function countInRange(dates: Date[], days: number, now: Date): number {
  return sum(dailyCounts(dates, days, now));
}

/** `weeks` 7-day buckets ending today, oldest first. */
export function weeklyBuckets(dates: Date[], weeks: number, now: Date): number[] {
  const perDay = dailyCounts(dates, weeks * 7, now);
  return Array.from({ length: weeks }, (_, w) => sum(perDay.slice(w * 7, w * 7 + 7)));
}

/** The same-length window immediately before the current one. */
export function previousWindowEnd(days: number, now: Date): Date {
  return new Date(dayStarts(days, now)[0].getTime() - 1);
}

export type Delta = { kind: 'good' | 'bad' | 'neutral'; pct: number | null };

export function delta(current: number, previous: number, opts: { higherIsBetter?: boolean } = {}): Delta {
  const higherIsBetter = opts.higherIsBetter ?? true;
  if (previous === 0) return { kind: 'neutral', pct: current === 0 ? 0 : null };
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return { kind: 'neutral', pct: 0 };
  const up = pct > 0;
  return { kind: up === higherIsBetter ? 'good' : 'bad', pct };
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Most recent join per user — the "joined X ago" on a member row. */
export function latestJoinByUser(events: CommunityEvent[]): Map<string, Date> {
  const m = new Map<string, Date>();
  for (const e of events) {
    if (e.type !== 'join') continue;
    const prev = m.get(e.userId);
    if (!prev || e.at > prev) m.set(e.userId, e.at);
  }
  return m;
}

function sum(a: number[]): number {
  return a.reduce((x, y) => x + y, 0);
}
