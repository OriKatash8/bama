import { formatDelta, signed, tileStats } from '../stats';
import type { CommunityEvent } from '../aggregate';

const NOW = new Date(2026, 8, 25, 15);
const day = (d: number, m = 8) => new Date(2026, m, d, 12);
const ev = (type: 'join' | 'leave', userId: string, at: Date): CommunityEvent => ({ id: `${userId}${type}`, type, userId, at });

describe('tileStats', () => {
  const base = { memberCount: 10, events: [] as CommunityEvent[], pendingSince: [], listingDates: [], range: 7, now: NOW };

  it('handles a brand-new community with no history without NaN', () => {
    const s = tileStats({ ...base, memberCount: 1 });
    expect(s.members).toEqual({ value: 1, delta: { kind: 'neutral', pct: 0 }, spark: [1, 1, 1, 1, 1, 1, 1] });
    expect(s.net).toEqual({ value: 0, joins: 0, exits: 0, spark: [0, 0, 0, 0, 0, 0, 0] });
    expect(s.requests).toEqual({ value: 0, oldest: null, spark: [0, 0, 0, 0, 0, 0, 0] });
    expect(s.market.value).toBe(0);
    expect(s.market.delta).toEqual({ kind: 'neutral', pct: 0 });
    expect(s.market.spark).toHaveLength(4);
  });

  it('compares members against the day before the range', () => {
    // 10 now; 2 joined inside the 7-day range → 8 the day before it began.
    const s = tileStats({ ...base, events: [ev('join', 'a', day(24)), ev('join', 'b', day(20))] });
    expect(s.members.delta).toEqual({ kind: 'good', pct: 25 });
  });

  it('counts net growth and its parts inside the range only', () => {
    const s = tileStats({
      ...base,
      events: [ev('join', 'a', day(24)), ev('join', 'b', day(22)), ev('leave', 'c', day(21)), ev('join', 'old', day(1))],
    });
    expect(s.net).toMatchObject({ value: 1, joins: 2, exits: 1 });
  });

  it('counts all pending requests, and finds the oldest', () => {
    const s = tileStats({ ...base, pendingSince: [day(23), day(10), null] });
    expect(s.requests.value).toBe(3);
    expect(s.requests.oldest).toEqual(day(10));
  });

  it('compares market listings with the previous window of the same length', () => {
    const s = tileStats({ ...base, listingDates: [day(24), day(23), day(22), day(15)] });
    expect(s.market.value).toBe(3);
    expect(s.market.delta).toEqual({ kind: 'good', pct: 200 });
  });
});

it('formats deltas and signed counts with a real minus sign', () => {
  expect(formatDelta({ kind: 'good', pct: 5 })).toBe('+5%');
  expect(formatDelta({ kind: 'bad', pct: -3 })).toBe('−3%');
  expect(formatDelta({ kind: 'neutral', pct: 0 })).toBe('0%');
  expect(formatDelta({ kind: 'neutral', pct: null })).toBe('—');
  expect([signed(12), signed(-3), signed(0)]).toEqual(['+12', '−3', '0']);
});
