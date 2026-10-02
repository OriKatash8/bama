import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, FieldValue, Timestamp, notify, type FeeDoc } from './helpers';
import { readConfig, type PricingConfig } from './config';
import {
  TIMEZONE, effectiveOverdueAt, earliestOverdueAt, feeIsOverdue,
} from '../pricing';

/**
 * The overdue-fee block (config/pricing.feeOverdueBlockDays, behind the
 * feeOverdueBlockEnabled kill switch).
 *
 * A professional with an unpaid fee past `effectiveOverdueAt` may not be hired
 * and may not send new offers. Their existing engagements are never touched.
 *
 * Three enforcement points read one predicate (feeIsOverdue / earliestOverdueAt,
 * pricing.ts):
 *   - hireProfessional queries the pro's fees live — the authoritative gate,
 *     next to the slot cap, and independent of anything stored here;
 *   - the offer/application create rules compare `request.time` against
 *     feeBlocks/{proId}.blockedFrom, which this file maintains. Rules cannot run
 *     a collection-group query, so they need a precomputed time — and storing a
 *     TIME rather than a flag is what lets the block start on the second without
 *     any cron;
 *   - the client mirror (useFeeArrears) only explains.
 *
 * feeBlocks/{proId} is server-only and owner-read-only, NOT a field on users/{uid}:
 * that doc is readable by every signed-in user, and a client must never learn that
 * a professional owes BAMA money (spec §6).
 */

type Update = admin.firestore.UpdateData<admin.firestore.DocumentData>;

export function feeBlockRef(proId: string) {
  return db.doc(`feeBlocks/${proId}`);
}

/**
 * The `overdueAt` fields to write when an engagement completes (or a dispute is
 * resolved as completed) at `fromMs`. Empty while the switch is off — the reason
 * turning it on can never block anyone for a fee completed while it was off.
 *
 * `keepEarlier`: a professional re-hired onto a project whose fee is still unpaid
 * keeps the clock that was already running on that debt; completing the second
 * role must not push the first one's deadline back.
 */
export function overdueStampFields(
  config: Pick<PricingConfig, 'feeOverdueBlockEnabled' | 'feeOverdueBlockDays'>,
  fromMs: number,
  existing?: Pick<FeeDoc, 'overdueAt' | 'feePaid' | 'status'>,
): Update {
  if (!config.feeOverdueBlockEnabled) return {};
  const fresh = fromMs + config.feeOverdueBlockDays * 86400_000;
  const prior = existing?.overdueAt?.toMillis?.();
  const unpaid = existing && existing.feePaid !== true && existing.status !== 'paid'
    && existing.status !== 'not_owed';
  const at = unpaid && typeof prior === 'number' && prior < fresh ? prior : fresh;
  return { overdueAt: Timestamp.fromMillis(at) };
}

/**
 * Rebuild feeBlocks/{proId}.blockedFrom from the professional's fees.
 *
 * In a transaction — the Admin SDK can read a query inside one — so two concurrent
 * recomputes serialise and the last write is computed from the last state. Called
 * DIRECTLY by every path that can lift or pause a block (settleFee,
 * resolveFeeDispute, contest, cancel, release) and again by the fee-write trigger
 * below as a safety net, so a professional who paid is never left blocked by a
 * late or failed trigger.
 *
 * Deliberately NOT switch-aware: it stores what the fees say. The rules read the
 * switch themselves, so turning it off lifts every block at once without
 * rewriting a single feeBlocks doc, and turning it back on is equally instant.
 */
export async function recomputeFeeBlock(proId: string): Promise<number | null> {
  const ref = feeBlockRef(proId);
  return db.runTransaction(async (tx) => {
    const feesSnap = await tx.get(
      db.collectionGroup('fees').where('professionalId', '==', proId),
    );
    const blockedFrom = earliestOverdueAt(feesSnap.docs.map((d) => d.data() as FeeDoc));
    const current = await tx.get(ref);
    const currentMs = current.get('blockedFrom')?.toMillis?.() ?? null;
    if (current.exists && currentMs === blockedFrom) return blockedFrom;
    if (blockedFrom === null && !current.exists) return null;
    tx.set(ref, {
      blockedFrom: blockedFrom === null ? null : Timestamp.fromMillis(blockedFrom),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return blockedFrom;
  });
}

/**
 * recomputeFeeBlock for callers whose own write has ALREADY committed (a payment
 * recorded, a dispute resolved). A failure here must not turn a recorded payment
 * into an error the admin retries — the trigger recomputes again regardless.
 */
export async function recomputeFeeBlockSafely(proId: string): Promise<void> {
  try {
    await recomputeFeeBlock(proId);
  } catch (err) {
    console.error('[feeOverdue] direct recompute failed; trigger will retry', proId, err);
  }
}

/** Safety net: any write to any fee doc recomputes that professional's block. */
export const onFeeWrittenRecomputeBlock = onDocumentWritten(
  'projects/{projectId}/fees/{proId}',
  async (event) => {
    const before = event.data?.before.data() as FeeDoc | undefined;
    const after = event.data?.after.data() as FeeDoc | undefined;
    // The only writes that cannot change blockedFrom are the ones that leave
    // every field the predicate reads untouched — a marker stamp, the charge
    // stub's bookkeeping. Skip those, so the cron's own marker writes do not
    // each cost a transaction.
    if (before && after && effectiveOverdueAt(before) === effectiveOverdueAt(after)) return;
    const proId = after?.professionalId ?? before?.professionalId ?? event.params.proId;
    await recomputeFeeBlock(proId);
  },
);

// ── Notifications ────────────────────────────────────────────────────────────

type Lang = 'he' | 'en';
type NoticeKind = 'fee_due' | 'fee_overdue_soon' | 'fee_overdue';

/**
 * Push text. Every other server notification is hardcoded Hebrew, because the
 * app's language lives only on the device. This table holds both, and picks
 * `users/{uid}.language` if that field ever exists — today it does not, so
 * Hebrew is what goes out.
 */
const NOTICE_TEXT: Record<NoticeKind, Record<Lang, (amount: number) => string>> = {
  fee_due: {
    he: (a) => `עמלת התיווך בסך ₪${a} לתשלום. יש להסדיר אותה כדי להמשיך לקבל פרויקטים חדשים.`,
    en: (a) => `Your ₪${a} brokerage fee is now due. Settle it to keep receiving new projects.`,
  },
  fee_overdue_soon: {
    he: (a) => `תזכורת: עמלה בסך ₪${a} טרם שולמה. מחר לא ניתן יהיה לשלוח הצעות או להתקבל לפרויקטים חדשים עד להסדרתה.`,
    en: (a) => `Reminder: a ₪${a} fee is still unpaid. From tomorrow you won't be able to send offers or be hired for new projects until it's settled.`,
  },
  fee_overdue: {
    he: (a) => `עמלה בסך ₪${a} באיחור. שליחת הצעות וקבלה לפרויקטים חדשים מושהות עד להסדרתה. הפרויקטים הקיימים שלך ממשיכים כרגיל.`,
    en: (a) => `A ₪${a} fee is overdue. Sending offers and being hired for new projects are paused until it's settled. Your current projects continue as normal.`,
  },
};

async function langOf(userId: string): Promise<Lang> {
  try {
    const v = (await db.doc(`users/${userId}`).get()).get('language');
    return v === 'en' ? 'en' : 'he';
  } catch {
    return 'he';
  }
}

export async function sendFeeNotice(
  kind: NoticeKind, proId: string, projectId: string, amount: number,
): Promise<void> {
  const lang = await langOf(proId);
  await notify({
    userId: proId,
    title: 'BAMA',
    message: NOTICE_TEXT[kind][lang](amount),
    data: { type: kind, projectId },
  });
}

const DAY = 86400_000;
const BATCH = 200;
/** How far back the due query looks. Hourly runs catch a fee within the hour;
 *  the slack covers missed runs. */
const DUE_LOOKBACK_MS = 2 * DAY;
/** How far back the block query looks. A fee whose block began longer ago than
 *  this has long since had its notice. */
const BLOCK_LOOKBACK_MS = 30 * DAY;

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

/** Which notice, if any, a fee is owed at `now`. Pure — the cron's whole decision. */
export function overdueNoticeFor(
  fee: FeeDoc, now: number,
): 'fee_overdue_soon' | 'fee_overdue' | null {
  const at = effectiveOverdueAt(fee);
  if (at === undefined) return null;
  if (now >= at) return fee.overdueBlockNotifiedAt ? null : 'fee_overdue';
  if (at - now <= DAY) return fee.overdueWarnedAt || fee.overdueBlockNotifiedAt ? null : 'fee_overdue_soon';
  return null;
}

/** Is the "fee is now due" notice owed? Keyed on chargeDueAt (the end of the
 *  contest window), and only for fees the overdue rule actually covers. */
export function dueNoticeOwed(fee: FeeDoc, now: number): boolean {
  if (fee.dueNotifiedAt) return false;
  // Undefined also for a fee with no overdueAt — completed while the switch was off.
  if (effectiveOverdueAt(fee) === undefined) return false;
  const due = fee.chargeDueAt?.toMillis?.();
  return typeof due === 'number' && due <= now;
}

export async function runFeeOverdueSweep(now: number): Promise<void> {
  // 1) Fee is now due — the contest window just closed. Uses the existing
  //    (engagementStatus, chargeDueAt) collection-group index.
  await paginate(
    db.collectionGroup('fees')
      .where('engagementStatus', '==', 'completed')
      .where('chargeDueAt', '>', Timestamp.fromMillis(now - DUE_LOOKBACK_MS))
      .where('chargeDueAt', '<=', Timestamp.fromMillis(now))
      .orderBy('chargeDueAt'),
    async (doc) => {
      const fee = doc.data() as FeeDoc;
      const projectId = doc.ref.parent.parent?.id;
      if (!projectId || !dueNoticeOwed(fee, now)) return;
      // Marker first: a crash between the two loses a notice, never doubles one —
      // the same trade every lifecycleCron sweep makes.
      await doc.ref.update({ dueNotifiedAt: FieldValue.serverTimestamp() });
      await sendFeeNotice('fee_due', doc.id, projectId, Math.max(0, fee.feeDue ?? 0));
    },
  );

  // 2) One day before the block, and the block itself. Needs the
  //    fees.overdueAt COLLECTION_GROUP field override.
  await paginate(
    db.collectionGroup('fees')
      .where('overdueAt', '>', Timestamp.fromMillis(now - BLOCK_LOOKBACK_MS))
      .where('overdueAt', '<=', Timestamp.fromMillis(now + DAY))
      .orderBy('overdueAt'),
    async (doc) => {
      const fee = doc.data() as FeeDoc;
      const projectId = doc.ref.parent.parent?.id;
      if (!projectId) return;
      const kind = overdueNoticeFor(fee, now);
      if (!kind) return;
      await doc.ref.update(
        kind === 'fee_overdue'
          ? { overdueBlockNotifiedAt: FieldValue.serverTimestamp() }
          : { overdueWarnedAt: FieldValue.serverTimestamp() },
      );
      await sendFeeNotice(kind, doc.id, projectId, Math.max(0, fee.feeDue ?? 0));
      // The block needs no write to START — the rule compares request.time — but
      // recompute anyway so feeBlocks is self-healing if a trigger was ever lost.
      if (kind === 'fee_overdue' && feeIsOverdue(fee, now)) {
        await recomputeFeeBlockSafely(doc.id);
      }
    },
  );
}

/**
 * Hourly, not inside the daily lifecycleCron: "one day before" and "the block
 * started" are only worth sending close to the moment they describe.
 */
export const feeOverdueCron = onSchedule(
  { schedule: 'every 60 minutes', timeZone: TIMEZONE },
  async () => {
    const config = await readConfig();
    if (!config.feeOverdueBlockEnabled) return;
    await runFeeOverdueSweep(Date.now());
  },
);
