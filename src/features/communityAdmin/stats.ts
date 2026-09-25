import {
  countInRange,
  dailyCounts,
  delta,
  flowSeries,
  memberCountSeries,
  previousWindowEnd,
  weeklyBuckets,
  type CommunityEvent,
  type Delta,
} from './aggregate';
import { marketWeeks } from './chartGeometry';

export type TileStats = {
  members: { value: number; delta: Delta; spark: number[] };
  requests: { value: number; oldest: Date | null; spark: number[] };
  net: { value: number; joins: number; exits: number; spark: number[] };
  market: { value: number; delta: Delta; spark: number[] };
};

/**
 * The four stat tiles for a range. Deltas compare against the same-length
 * window just before it; the members delta against the count the day before
 * the range began (walked back through the event log).
 */
export function tileStats(input: {
  memberCount: number;
  events: CommunityEvent[];
  pendingSince: (Date | null)[];
  listingDates: Date[];
  range: number;
  now: Date;
}): TileStats {
  const { memberCount, events, pendingSince, listingDates, range, now } = input;
  const flow = flowSeries(events, range, now);
  const joins = flow.joins.reduce((a, b) => a + b, 0);
  const exits = flow.exits.reduce((a, b) => a + b, 0);
  const pending = pendingSince.filter((d): d is Date => d !== null);
  const oldest = pending.length ? new Date(Math.min(...pending.map((d) => d.getTime()))) : null;
  const beforeRange = memberCountSeries(memberCount, events, range + 1, now)[0];

  return {
    members: {
      value: memberCount,
      delta: delta(memberCount, beforeRange),
      spark: memberCountSeries(memberCount, events, range, now),
    },
    requests: {
      value: pendingSince.length,
      oldest,
      spark: dailyCounts(pending, range, now),
    },
    net: {
      value: joins - exits,
      joins,
      exits,
      spark: flow.joins.map((j, i) => j - flow.exits[i]),
    },
    market: {
      value: countInRange(listingDates, range, now),
      delta: delta(countInRange(listingDates, range, now), countInRange(listingDates, range, previousWindowEnd(range, now))),
      spark: weeklyBuckets(listingDates, marketWeeks(range), now),
    },
  };
}

/** "+5%", "−3%" (a real minus), "0%", or "—" when there's nothing to compare with. */
export function formatDelta(d: Delta): string {
  if (d.pct === null) return '—';
  if (d.pct > 0) return `+${d.pct}%`;
  if (d.pct < 0) return `−${Math.abs(d.pct)}%`;
  return '0%';
}

/** A signed count: "+12", "−3", "0". */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}
