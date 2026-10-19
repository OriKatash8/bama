import * as admin from 'firebase-admin';
import { MetricServiceClient } from '@google-cloud/monitoring';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import { db, FieldValue, requireAdmin } from '../lifecycle/helpers';
import { collectUsage, type ListTimeSeries, type UsageSnapshot } from './collect';
import { QUOTA_TZ } from './windows';

const REGION = 'europe-west1';
/** A refresh within this many ms of the last snapshot just returns it (Monitoring quota, spam). */
export const MIN_REFRESH_MS = 30_000;

let client: MetricServiceClient | null = null;
const list: ListTimeSeries = async (request) => {
  client ??= new MetricServiceClient();
  const [series] = await client.listTimeSeries(request as never);
  return series as unknown[];
};

function projectId(): string {
  return process.env.GCLOUD_PROJECT ?? admin.app().options.projectId ?? '';
}
function appBucket(): string | null {
  return admin.app().options.storageBucket ?? (projectId() ? `${projectId()}.firebasestorage.app` : null);
}

/** Collect and write `adminStats/usage`. Sections that failed keep their last good value. */
export async function runUsageCollection(now: Date = new Date()): Promise<UsageSnapshot> {
  const snapshot = await collectUsage(list, projectId(), appBucket(), now);
  await db.doc('adminStats/usage').set({ ...snapshot, tz: QUOTA_TZ, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return snapshot;
}

/** Every 60 minutes. */
export const collectUsageStats = onSchedule(
  { schedule: 'every 60 minutes', region: REGION, timeoutSeconds: 120, memory: '256MiB' },
  async () => {
    const snap = await runUsageCollection();
    if (snap.errors.length) console.warn('[collectUsageStats] partial:', snap.errors);
  }
);

/** On demand from the admin screen. Admin only. */
export const refreshUsageStats = onCall({ region: REGION, timeoutSeconds: 120, memory: '256MiB' }, async (request) => {
  requireAdmin(request.auth?.token);
  const existing = await db.doc('adminStats/usage').get();
  const updatedAt = existing.data()?.updatedAt as { toMillis?: () => number } | undefined;
  if (updatedAt?.toMillis && Date.now() - updatedAt.toMillis() < MIN_REFRESH_MS) {
    return { ok: true, throttled: true, errors: (existing.data()?.errors as string[]) ?? [] };
  }
  const snap = await runUsageCollection();
  return { ok: true, throttled: false, errors: snap.errors };
});
