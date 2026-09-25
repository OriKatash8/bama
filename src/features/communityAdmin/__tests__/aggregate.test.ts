import {
  dayStarts,
  flowSeries,
  netGrowth,
  memberCountSeries,
  dailyCounts,
  weeklyBuckets,
  countInRange,
  delta,
  median,
  latestJoinByUser,
  previousWindowEnd,
  type CommunityEvent,
} from '../aggregate';

// Thursday 25 Sep 2026, mid-afternoon local time.
const NOW = new Date(2026, 8, 25, 15, 30);
const day = (d: number, h = 12) => new Date(2026, 8, d, h);
const ev = (type: 'join' | 'leave', userId: string, at: Date): CommunityEvent => ({
  id: `${type}-${userId}-${at.getTime()}`,
  type,
  userId,
  at,
});

describe('dayStarts', () => {
  it('returns N local midnights, oldest first, ending today', () => {
    const days = dayStarts(7, NOW);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual(new Date(2026, 8, 19));
    expect(days[6]).toEqual(new Date(2026, 8, 25));
  });
});

describe('flowSeries', () => {
  it('buckets joins and exits by the local day they happened on', () => {
    const events = [
      ev('join', 'a', day(25, 9)),
      ev('join', 'b', day(25, 1)),
      ev('leave', 'c', day(24)),
      ev('join', 'd', day(19, 0)),
    ];
    const s = flowSeries(events, 7, NOW);
    expect(s.joins).toEqual([1, 0, 0, 0, 0, 0, 2]);
    expect(s.exits).toEqual([0, 0, 0, 0, 0, 1, 0]);
  });

  it('ignores events before the range and after now', () => {
    const events = [ev('join', 'old', day(18, 23)), ev('join', 'future', day(26))];
    const s = flowSeries(events, 7, NOW);
    expect(s.joins.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('netGrowth', () => {
  it('is joins minus exits inside the range only', () => {
    const events = [
      ev('join', 'a', day(25)),
      ev('join', 'b', day(20)),
      ev('leave', 'c', day(21)),
      ev('join', 'old', day(10)),
    ];
    expect(netGrowth(events, 7, NOW)).toBe(1);
  });
});

describe('memberCountSeries', () => {
  it('walks the current count back through the events to each day end', () => {
    // 10 members now. Yesterday someone left, today two joined.
    const events = [ev('join', 'a', day(25, 9)), ev('join', 'b', day(25, 10)), ev('leave', 'c', day(24))];
    const s = memberCountSeries(10, events, 3, NOW);
    // today = 10; end of 24th: 10 - today's 2 joins = 8; end of 23rd: 8 + the 24th's leave = 9
    expect(s).toEqual([9, 8, 10]);
  });
});

describe('dailyCounts / countInRange', () => {
  const dates = [day(25), day(25, 8), day(22), day(10)];
  it('counts dates per day inside the range', () => {
    expect(dailyCounts(dates, 7, NOW)).toEqual([0, 0, 0, 1, 0, 0, 2]);
  });
  it('counts dates inside the range', () => {
    expect(countInRange(dates, 7, NOW)).toBe(3);
  });
});

describe('weeklyBuckets', () => {
  it('splits the range into 7-day buckets ending today, oldest first', () => {
    const dates = [day(25), day(19), day(18), day(12), day(11)];
    // weeks: [5..11] [12..18] [19..25]
    expect(weeklyBuckets(dates, 3, NOW)).toEqual([1, 2, 2]);
  });
});

describe('delta', () => {
  it('reads a rise as good and a fall as bad by default', () => {
    expect(delta(12, 10)).toEqual({ kind: 'good', pct: 20 });
    expect(delta(8, 10)).toEqual({ kind: 'bad', pct: -20 });
  });
  it('flips for metrics where a rise is bad', () => {
    expect(delta(12, 10, { higherIsBetter: false }).kind).toBe('bad');
  });
  it('is neutral when unchanged or there is no baseline', () => {
    expect(delta(5, 5)).toEqual({ kind: 'neutral', pct: 0 });
    expect(delta(5, 0)).toEqual({ kind: 'neutral', pct: null });
  });
});

describe('median', () => {
  it('handles odd, even and empty input', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('latestJoinByUser', () => {
  it('keeps the most recent join per user', () => {
    const m = latestJoinByUser([
      ev('join', 'a', day(10)),
      ev('join', 'a', day(20)),
      ev('leave', 'a', day(23)),
      ev('join', 'b', day(5)),
    ]);
    expect(m.get('a')).toEqual(day(20));
    expect(m.get('b')).toEqual(day(5));
  });
});

describe('previousWindowEnd', () => {
  it('ends the instant before the current window starts, so the same maths gives the previous window', () => {
    const end = previousWindowEnd(7, NOW);
    expect(end).toEqual(new Date(new Date(2026, 8, 19).getTime() - 1));
    const events = [ev('join', 'in-prev', day(15)), ev('join', 'in-current', day(20))];
    expect(netGrowth(events, 7, end)).toBe(1);
  });
});
