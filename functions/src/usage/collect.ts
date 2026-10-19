import { quotaReset, startOfDay, startOfMonth } from './windows';

/** The one Monitoring call we use; a fake stands in for it in tests. */
export type ListTimeSeries = (request: Record<string, unknown>) => Promise<unknown[]>;

type Point = { value?: { int64Value?: unknown; doubleValue?: number } };
type Series = {
  resource?: { labels?: Record<string, string> };
  points?: Point[];
};

export const METRICS = {
  reads: 'firestore.googleapis.com/document/read_count',
  writes: 'firestore.googleapis.com/document/write_count',
  deletes: 'firestore.googleapis.com/document/delete_count',
  storedBytes: 'storage.googleapis.com/storage/total_bytes',
  egressBytes: 'storage.googleapis.com/network/sent_bytes_count',
  // Covers gen1 AND gen2 functions. run.googleapis.com/request_count only sees gen2, and
  // using both would double count.
  invocations: 'cloudfunctions.googleapis.com/function/execution_count',
} as const;

const DAY_SECONDS = 86_400;
const TOP_FUNCTIONS = 5;
const TOP_BUCKETS = 10;

export type FunctionCount = { name: string; count: number };
export type PeriodStats = {
  startAt: string;
  firestore: { reads: number; writes: number; deletes: number };
  egressBytes: number;
  functions: { invocations: number; top: FunctionCount[] };
};
export type UsageSnapshot = {
  project: string;
  today?: Partial<PeriodStats> & { startAt: string };
  month?: Partial<PeriodStats> & { startAt: string };
  storage?: { appBucketBytes: number | null; totalBytes: number; buckets: { name: string; bytes: number }[] };
  quota: { resetsAt: string; israelHour: number; israelMinute: number };
  errors: string[];
};

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  const long = v as { toNumber?: () => number; low?: number; high?: number };
  if (typeof long.toNumber === 'function') return long.toNumber();
  return Number(String(v)) || 0;
}

function pointValue(p: Point): number {
  return p.value?.doubleValue != null ? p.value.doubleValue : num(p.value?.int64Value);
}

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** Sum of a DELTA metric over [start, end], optionally grouped by a resource label. */
async function sumOver(
  list: ListTimeSeries,
  project: string,
  metric: string,
  start: Date,
  end: Date,
  groupBy?: string
): Promise<{ total: number; groups: Map<string, number> }> {
  const response = await list({
    name: `projects/${project}`,
    filter: `metric.type="${metric}"`,
    interval: { startTime: { seconds: seconds(start) }, endTime: { seconds: seconds(end) } },
    aggregation: {
      alignmentPeriod: { seconds: DAY_SECONDS },
      perSeriesAligner: 'ALIGN_SUM',
      crossSeriesReducer: 'REDUCE_SUM',
      ...(groupBy ? { groupByFields: [`resource.label.${groupBy}`] } : {}),
    },
    view: 'FULL',
  });
  let total = 0;
  const groups = new Map<string, number>();
  for (const s of response as Series[]) {
    const sum = (s.points ?? []).reduce((acc, p) => acc + pointValue(p), 0);
    total += sum;
    if (groupBy) {
      const key = s.resource?.labels?.[groupBy] ?? '(unknown)';
      groups.set(key, (groups.get(key) ?? 0) + sum);
    }
  }
  return { total, groups };
}

/** Latest stored-bytes sample per bucket (a GAUGE: take the newest point, not a sum). */
async function storedBytes(list: ListTimeSeries, project: string, now: Date) {
  const response = await list({
    name: `projects/${project}`,
    filter: `metric.type="${METRICS.storedBytes}"`,
    interval: { startTime: { seconds: seconds(now) - 3 * DAY_SECONDS }, endTime: { seconds: seconds(now) } },
    view: 'FULL',
  });
  const perBucket = new Map<string, number>();
  for (const s of response as Series[]) {
    const bucket = s.resource?.labels?.bucket_name ?? '(unknown)';
    const newest = s.points?.[0]; // the API returns newest first
    if (newest) perBucket.set(bucket, (perBucket.get(bucket) ?? 0) + pointValue(newest));
  }
  return perBucket;
}

async function period(list: ListTimeSeries, project: string, start: Date, now: Date, errors: string[], label: string) {
  const out: Partial<PeriodStats> & { startAt: string } = { startAt: start.toISOString() };
  const guard = async (what: string, run: () => Promise<void>) => {
    try { await run(); } catch (e) { errors.push(`${label}.${what}: ${e instanceof Error ? e.message : String(e)}`); }
  };

  await Promise.all([
    guard('firestore', async () => {
      const [r, w, d] = await Promise.all([
        sumOver(list, project, METRICS.reads, start, now),
        sumOver(list, project, METRICS.writes, start, now),
        sumOver(list, project, METRICS.deletes, start, now),
      ]);
      out.firestore = { reads: r.total, writes: w.total, deletes: d.total };
    }),
    guard('egress', async () => {
      out.egressBytes = (await sumOver(list, project, METRICS.egressBytes, start, now)).total;
    }),
    guard('functions', async () => {
      const { total, groups } = await sumOver(list, project, METRICS.invocations, start, now, 'function_name');
      const top = [...groups.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, TOP_FUNCTIONS);
      out.functions = { invocations: total, top };
    }),
  ]);
  return out;
}

/**
 * Gather today's (Pacific day) and month-to-date usage. Every group is fetched on its own:
 * a failure is recorded in `errors` and that group is simply left out, so the caller can
 * merge what succeeded without wiping the last good value of what did not.
 */
export async function collectUsage(
  list: ListTimeSeries,
  project: string,
  appBucket: string | null,
  now: Date = new Date()
): Promise<UsageSnapshot> {
  const errors: string[] = [];
  const reset = quotaReset(now);
  const snapshot: UsageSnapshot = {
    project,
    quota: { resetsAt: reset.resetsAt.toISOString(), israelHour: reset.israelHour, israelMinute: reset.israelMinute },
    errors,
  };

  const [today, month] = await Promise.all([
    period(list, project, startOfDay(now), now, errors, 'today'),
    period(list, project, startOfMonth(now), now, errors, 'month'),
  ]);
  snapshot.today = today;
  snapshot.month = month;

  try {
    const perBucket = await storedBytes(list, project, now);
    const buckets = [...perBucket.entries()].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes);
    snapshot.storage = {
      appBucketBytes: appBucket ? (perBucket.get(appBucket) ?? 0) : null,
      totalBytes: buckets.reduce((a, b) => a + b.bytes, 0),
      buckets: buckets.slice(0, TOP_BUCKETS),
    };
  } catch (e) {
    errors.push(`storage: ${e instanceof Error ? e.message : String(e)}`);
  }
  return snapshot;
}

