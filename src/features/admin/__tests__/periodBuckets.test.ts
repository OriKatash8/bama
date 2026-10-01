import { periodBuckets } from '../periodBuckets';

const NOW = new Date(2026, 9, 2, 15, 30); // 2 Oct 2026, 15:30 local time
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

it('daily: the last 24 hours, one bucket per hour, the current hour last', () => {
  const b = periodBuckets('daily', NOW, 'en-US');
  expect(b.starts).toHaveLength(24);
  expect(b.starts[0]).toBe(sec(new Date(2026, 9, 1, 16)));
  expect(b.starts[23]).toBe(sec(new Date(2026, 9, 2, 15)));
  expect(b.end).toBe(sec(new Date(2026, 9, 2, 16)));
  expect(b.labels[0]).toBe('16:00');
  expect(b.labels[23]).toBe('15:00');
});

it('weekly: the last 7 days, today last', () => {
  const b = periodBuckets('weekly', NOW, 'en-US');
  expect(b.starts).toHaveLength(7);
  expect(b.starts[0]).toBe(sec(new Date(2026, 8, 26)));
  expect(b.starts[6]).toBe(sec(new Date(2026, 9, 2)));
  expect(b.end).toBe(sec(new Date(2026, 9, 3)));
  expect(b.labels[6]).toBe('Fri');
});

it('monthly: the last 30 days, today last', () => {
  const b = periodBuckets('monthly', NOW, 'en-US');
  expect(b.starts).toHaveLength(30);
  expect(b.starts[0]).toBe(sec(new Date(2026, 8, 3)));
  expect(b.end).toBe(sec(new Date(2026, 9, 3)));
  expect(b.labels[29]).toBe('10/2');
});

it('yearly: the last 12 calendar months, the current one last', () => {
  const b = periodBuckets('yearly', NOW, 'en-US');
  expect(b.starts).toHaveLength(12);
  expect(b.starts[0]).toBe(sec(new Date(2025, 10, 1)));
  expect(b.end).toBe(sec(new Date(2026, 10, 1)));
  expect(b.labels[0]).toBe('Nov');
  expect(b.labels[11]).toBe('Oct');
});

it('buckets are back to back with no gaps', () => {
  for (const p of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
    const b = periodBuckets(p, NOW, 'en-US');
    for (let i = 1; i < b.starts.length; i++) expect(b.starts[i]).toBeGreaterThan(b.starts[i - 1]);
    expect(b.end).toBeGreaterThan(b.starts[b.starts.length - 1]);
  }
});
