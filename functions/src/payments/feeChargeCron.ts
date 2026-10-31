import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, Timestamp, type FeeDoc } from '../lifecycle/helpers';
import { runStubChargeFor } from '../lifecycle/charge';
import { TIMEZONE } from '../pricing';
import { readPaymentsConfig, type PaymentsConfig } from './guard';
import { runCharge, reconcileStaleClaim } from './charge';
import { isClaimStale } from './chargeLogic';

const DAY = 86400_000;
/**
 * How far back a FIRST attempt is looked for. A fee that has never been tried and
 * whose window closed longer ago than this is left alone on purpose: turning a
 * provider on must not sweep up a backlog of old fees (and message the pros who
 * owe them) as a side effect. An admin can still settle those by hand, and a
 * fee that already has a chargeState is found by the state query regardless of age.
 */
export const FIRST_ATTEMPT_LOOKBACK_MS = 14 * DAY;
const BATCH = 200;

type Doc = admin.firestore.QueryDocumentSnapshot;

async function paginate(query: admin.firestore.Query, handler: (doc: Doc) => Promise<void>) {
  let last: Doc | undefined;
  for (;;) {
    let q = query.limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) await handler(doc);
    if (snap.size < BATCH) break;
    last = snap.docs[snap.docs.length - 1];
  }
}

export type SweepTally = { tried: number; stub: number; reconciled: number; errors: number };

/**
 * One pass over everything that may need a charge action. Each fee is isolated: a
 * throw is logged and counted, never allowed to stop the batch.
 */
export async function runFeeChargeSweep(
  now: number, config: PaymentsConfig,
): Promise<SweepTally> {
  const tally: SweepTally = { tried: 0, stub: 0, reconciled: 0, errors: 0 };
  if (config.paymentProvider === 'none') return tally;

  const seen = new Set<string>();
  const handle = async (doc: Doc) => {
    if (seen.has(doc.ref.path)) return;
    seen.add(doc.ref.path);
    const projectId = doc.ref.parent.parent?.id;
    if (!projectId) return;
    const proId = doc.id;
    const fee = doc.data() as FeeDoc;
    try {
      if (fee.chargeState === 'charging') {
        if (isClaimStale(fee, now)) {
          await reconcileStaleClaim(projectId, proId, config, now);
          tally.reconciled += 1;
        }
        return;
      }
      const res = await runCharge(projectId, proId, config, now);
      if (res.status === 'no-provider') {
        // Provider is off for this professional (fake provider, not a tester):
        // exactly today's stub, nothing new.
        await runStubChargeFor(projectId, proId, fee);
        tally.stub += 1;
      } else if (res.status !== 'skipped') {
        tally.tried += 1;
      }
    } catch (err) {
      tally.errors += 1;
      console.error('[feeChargeCron] fee failed; continuing', doc.ref.path, err);
    }
  };

  // 1) Fees that already carry charge state: retries that are due, re-queued
  //    needs_card fees, and claims that may have gone stale. A small set.
  //    Needs the fees.chargeState COLLECTION_GROUP field override.
  await paginate(
    db.collectionGroup('fees').where('chargeState', 'in', ['idle', 'failed', 'charging']),
    handle,
  );

  // 2) First attempts: completed, window closed within the lookback, never tried.
  //    Uses the existing (engagementStatus, chargeDueAt) collection-group index.
  await paginate(
    db.collectionGroup('fees')
      .where('engagementStatus', '==', 'completed')
      .where('chargeDueAt', '>', Timestamp.fromMillis(now - FIRST_ATTEMPT_LOOKBACK_MS))
      .where('chargeDueAt', '<=', Timestamp.fromMillis(now))
      .orderBy('chargeDueAt'),
    async (doc) => {
      const fee = doc.data() as FeeDoc;
      // A fee with state was (or will be) handled by query 1; the stub fallback
      // keeps its own chargeAttemptCount guard.
      if (fee.chargeState) return;
      await handle(doc);
    },
  );

  return tally;
}

/**
 * Hourly (Asia/Jerusalem), europe-west1. Does nothing while paymentProvider is
 * 'none', and lifecycleCron's stub sweep covers that case unchanged.
 */
export const feeChargeCron = onSchedule(
  { region: 'europe-west1', schedule: 'every 60 minutes', timeZone: TIMEZONE, timeoutSeconds: 300 },
  async () => {
    const config = await readPaymentsConfig();
    if (config.paymentProvider === 'none') return;
    const tally = await runFeeChargeSweep(Date.now(), config);
    console.log('[feeChargeCron]', JSON.stringify(tally));
  },
);
