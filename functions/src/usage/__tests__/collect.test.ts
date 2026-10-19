import { collectUsage, METRICS, type ListTimeSeries } from '../collect';

const NOW = new Date('2026-10-19T12:00:00Z'); // Pacific day starts 2026-10-19T07:00Z; month 2026-10-01T07:00Z

type Req = { filter: string; interval: { startTime: { seconds: number } }; aggregation?: { groupByFields?: string[] } };
const metricOf = (r: Req) => /metric.type="([^"]+)"/.exec(r.filter)![1];
const startIso = (r: Req) => new Date(r.interval.startTime.seconds * 1000).toISOString();
const pts = (...v: number[]) => v.map((n) => ({ value: { int64Value: String(n) } }));

/** today = the Pacific-day window, month = the month window. */
function fake(opts: { fail?: string[] } = {}): { list: ListTimeSeries; calls: Req[] } {
  const calls: Req[] = [];
  const list: ListTimeSeries = async (request) => {
    const r = request as unknown as Req;
    calls.push(r);
    const m = metricOf(r);
    if (opts.fail?.includes(m)) throw new Error(`boom ${m}`);
    const today = startIso(r) === '2026-10-19T07:00:00.000Z';
    switch (m) {
      case METRICS.reads: return [{ points: pts(today ? 100 : 1000, today ? 20 : 200) }];
      case METRICS.writes: return [{ points: pts(today ? 5 : 50) }];
      case METRICS.deletes: return [{ points: pts(today ? 1 : 10) }];
      case METRICS.egressBytes: return [{ points: pts(today ? 2048 : 4096) }];
      case METRICS.invocations: // grouped by function_name
        return [
          { resource: { labels: { function_name: 'a' } }, points: pts(today ? 3 : 30) },
          { resource: { labels: { function_name: 'b' } }, points: pts(today ? 9 : 90) },
          { resource: { labels: { function_name: 'c' } }, points: pts(today ? 1 : 10) },
          { resource: { labels: { function_name: 'd' } }, points: pts(today ? 7 : 70) },
          { resource: { labels: { function_name: 'e' } }, points: pts(today ? 5 : 50) },
          { resource: { labels: { function_name: 'f' } }, points: pts(today ? 2 : 20) },
          { resource: { labels: { function_name: 'g' } }, points: pts(today ? 8 : 80) },
        ];
      case METRICS.storedBytes:
        return [
          { resource: { labels: { bucket_name: 'app.firebasestorage.app' } }, points: [{ value: { doubleValue: 1000.5 } }, { value: { doubleValue: 1 } }] },
          { resource: { labels: { bucket_name: 'app.firebasestorage.app' } }, points: [{ value: { doubleValue: 500 } }] }, // second storage class
          { resource: { labels: { bucket_name: 'backup' } }, points: [{ value: { doubleValue: 6_000_000_000 } }] },
        ];
    }
    return [];
  };
  return { list, calls };
}

it('sums Firestore reads/writes/deletes per window (all points, all series)', async () => {
  const s = await collectUsage(fake().list, 'p', 'app.firebasestorage.app', NOW);
  expect(s.today!.firestore).toEqual({ reads: 120, writes: 5, deletes: 1 });
  expect(s.month!.firestore).toEqual({ reads: 1200, writes: 50, deletes: 10 });
  expect(s.errors).toEqual([]);
});

it('uses the Pacific-day start for today and the 1st (Pacific) for the month', async () => {
  const s = await collectUsage(fake().list, 'p', null, NOW);
  expect(s.today!.startAt).toBe('2026-10-19T07:00:00.000Z');
  expect(s.month!.startAt).toBe('2026-10-01T07:00:00.000Z');
});

it('invocations: total over all functions, top 5 sorted desc', async () => {
  const s = await collectUsage(fake().list, 'p', null, NOW);
  expect(s.today!.functions!.invocations).toBe(35);
  expect(s.today!.functions!.top).toEqual([
    { name: 'b', count: 9 }, { name: 'g', count: 8 }, { name: 'd', count: 7 }, { name: 'e', count: 5 }, { name: 'a', count: 3 },
  ]);
  expect(s.month!.functions!.top).toHaveLength(5);
});

it('asks for the invocation metric that covers both function generations, grouped by function', async () => {
  const { list, calls } = fake();
  await collectUsage(list, 'p', null, NOW);
  const inv = calls.filter((c) => metricOf(c) === METRICS.invocations);
  expect(inv).toHaveLength(2);
  expect(inv[0].aggregation!.groupByFields).toEqual(['resource.label.function_name']);
  expect(calls.some((c) => metricOf(c).startsWith('run.googleapis.com'))).toBe(false);
});

it('egress is summed per window', async () => {
  const s = await collectUsage(fake().list, 'p', null, NOW);
  expect(s.today!.egressBytes).toBe(2048);
  expect(s.month!.egressBytes).toBe(4096);
});

it('storage: newest point per series, summed per bucket, app bucket reported separately', async () => {
  const s = await collectUsage(fake().list, 'p', 'app.firebasestorage.app', NOW);
  expect(s.storage!.appBucketBytes).toBe(1500.5);
  expect(s.storage!.totalBytes).toBe(6_000_001_500.5);
  expect(s.storage!.buckets[0]).toEqual({ name: 'backup', bytes: 6_000_000_000 });
});

it('quota reset is reported as an Israel hour (10:00 today: both on summer time)', async () => {
  const s = await collectUsage(fake().list, 'p', null, NOW);
  expect(s.quota).toEqual({ resetsAt: '2026-10-20T07:00:00.000Z', israelHour: 10, israelMinute: 0 });
});

it('one failing metric is recorded and the rest still come back', async () => {
  const s = await collectUsage(fake({ fail: [METRICS.writes] }).list, 'p', null, NOW);
  expect(s.today!.firestore).toBeUndefined();       // the group that failed is left out…
  expect(s.today!.egressBytes).toBe(2048);          // …everything else is intact
  expect(s.today!.functions!.invocations).toBe(35);
  expect(s.storage).toBeDefined();
  expect(s.errors.join('\n')).toMatch(/today\.firestore: boom .*write_count/);
  expect(s.errors.join('\n')).toMatch(/month\.firestore/);
});

it('a storage failure does not lose the other sections', async () => {
  const s = await collectUsage(fake({ fail: [METRICS.storedBytes] }).list, 'p', null, NOW);
  expect(s.storage).toBeUndefined();
  expect(s.today!.firestore).toBeDefined();
  expect(s.errors).toEqual([expect.stringMatching(/^storage:/)]);
});

it('handles Long-like int64 values and empty responses', async () => {
  const list: ListTimeSeries = async (r) => {
    const m = metricOf(r as unknown as Req);
    if (m === METRICS.reads) return [{ points: [{ value: { int64Value: { toNumber: () => 42 } } }] }];
    return [];
  };
  const s = await collectUsage(list, 'p', null, NOW);
  expect(s.today!.firestore).toEqual({ reads: 42, writes: 0, deletes: 0 });
  expect(s.today!.functions).toEqual({ invocations: 0, top: [] });
});
